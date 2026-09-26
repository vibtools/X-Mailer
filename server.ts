import dotenv from "dotenv";
import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import {
  checkRateLimit,
  generateToken,
  hashPassword,
  recordFailedAttempt,
  resetAttempts,
  verifyPassword,
  verifyToken,
} from "./server/auth";
import {
  extractDbHost,
  hasRealDatabaseUrl,
  initDatabase,
  DATABASE_URL,
  pool,
  testConnectionUri,
} from "./server/db";

import {
  deleteUploadedFile,
  getStorageConfig,
  getUploadedFiles,
  initStorageSchema,
  saveStorageConfig,
  testStorageConnection,
  uploadFileToSupabase,
} from "./server/storage";
import { htmlToPlainText } from "./src/utils/htmlToPlainText";
import {
  extractDomainFromEmail,
  generateAntiSpamHeaders,
  sanitizeHeaderValue,
  sanitizeReplyTo,
} from "./src/utils/antiSpamHeaders";
import {
  sendEmailUnified,
  verifyChannel,
  evictChannel,
  EmailChannel,
} from "./server/providers";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Support up to 50MB payloads for base64 email attachments
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Initialize Neon PostgreSQL Database
  let dbConnected = false;
  let dbError = "";
  try {
    await initDatabase();
    await initStorageSchema();
    dbConnected = true;
  } catch (err: any) {
    dbConnected = false;
    dbError = err.message;
    console.error("[Neon DB] Startup connection failure:", err);
  }

  // Neon DB Helper: Add audit log to neon_logs
  const insertNeonLog = async (entry: {
    level: string;
    message: string;
    userId?: string;
    taskId?: string;
    taskName?: string;
    apiName?: string;
    recipient?: string;
    details?: any;
  }) => {
    try {
      const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = new Date().toLocaleTimeString();
      await pool.query(
        `INSERT INTO neon_logs (id, timestamp, level, user_id, task_id, task_name, api_name, recipient, message, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          timestamp,
          entry.level || "info",
          entry.userId || null,
          entry.taskId || null,
          entry.taskName || null,
          entry.apiName || null,
          entry.recipient || null,
          entry.message,
          JSON.stringify(entry.details || {}),
        ],
      );
    } catch (e) {
      console.error("[Neon DB] Failed to insert log to DB:", e);
    }
  };

  // ==========================================
  // SECURE USER & ADMIN AUTHENTICATION ENDPOINTS
  // ==========================================

  // Check if system has an admin configured or needs first-time setup
  app.get(["/api/auth/setup-status", "/api/auth/status"], async (req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) {
        return res.json({
          isSetup: false,
          adminExists: false,
        });
      }
      const { rows } = await pool.query(
        "SELECT COUNT(*) FROM neonUsers WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%'",
      );
      const adminCount = parseInt(rows[0]?.count || "0", 10);
      return res.json({
        isSetup: adminCount > 0,
        adminExists: adminCount > 0,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({ isSetup: false, adminExists: false, error: err.message });
    }
  });

  // Initial First-Time Setup of Master Admin User
  app.post("/api/auth/setup-admin", async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;

      // Ensure no admin user exists yet
      const { rows: existingAdmins } = await pool.query(
        "SELECT COUNT(*) FROM neonUsers WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%'",
      );
      const adminCount = parseInt(existingAdmins[0]?.count || "0", 10);
      if (adminCount > 0) {
        return res.status(409).json({
          success: false,
          error: "Admin user already configured",
          message:
            "Platform already has a master administrator configured. Please sign in via /vcon.",
          adminExists: true,
        });
      }

      if (!name || !name.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Administrator name is required." });
      }

      if (!email || !email.trim() || !email.includes("@")) {
        return res.status(400).json({
          success: false,
          error: "A valid administrator email is required.",
        });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          error: "Password must be at least 6 characters.",
        });
      }

      const id = `u_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const passwordHash = hashPassword(password.trim());

      const { rows } = await pool.query(
        `INSERT INTO neonUsers (id, name, email, password_hash, role, status, daily_limit, used_today, last_login)
         VALUES ($1, $2, $3, $4, 'admin', 'active', 100000, 0, 'Just now')
         RETURNING id, name, email, role, status, daily_limit, used_today, last_login, created_at`,
        [id, name.trim(), email.trim().toLowerCase(), passwordHash],
      );

      const admin = rows[0];

      // Generate signed token
      const token = generateToken({
        id: admin.id,
        email: admin.email,
        role: "admin",
      });

      await insertNeonLog({
        level: "success",
        message: `Platform master administrator created successfully during initial setup: ${admin.email}`,
      });

      return res.json({
        success: true,
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          dailyLimit: admin.daily_limit,
          usedToday: admin.used_today,
          lastLogin: "Just now",
          createdAt: admin.created_at
            ? new Date(admin.created_at).toISOString().split("T")[0]
            : "",
        },
        message: "Master administrator account created successfully.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // User Login (Secure PBKDF2 hash verification against Neon DB)
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimitKey = `user_${clientIp}_${email || ""}`;

      // Check brute-force rate limiter
      const rateCheck = checkRateLimit(rateLimitKey);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `Too many failed attempts. Account temporarily locked. Please retry in ${rateCheck.waitSeconds} seconds.`,
        });
      }

      if (!email || !password) {
        return res
          .status(400)
          .json({ success: false, error: "Email and password are required." });
      }

      const { rows } = await pool.query(
        "SELECT * FROM neonUsers WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email.trim()],
      );

      if (rows.length === 0) {
        recordFailedAttempt(rateLimitKey);
        return res
          .status(401)
          .json({ success: false, error: "Invalid email or password." });
      }

      const user = rows[0];

      if (user.status === "deactivated") {
        return res.status(403).json({
          success: false,
          error:
            "Your account has been deactivated by the administrator. Contact support.",
        });
      }

      // Check Allowed Domains restriction
      const reqDomain = (
        req.body.currentDomain ||
        (req.headers["x-forwarded-host"] as string)?.split(",")[0] ||
        (req.headers.host as string) ||
        ""
      )
        .split(":")[0]
        .toLowerCase()
        .trim();

      const userAllowedDomains: string[] = Array.isArray(user.allowed_domains)
        ? user.allowed_domains
        : typeof user.allowed_domains === "string"
        ? JSON.parse(user.allowed_domains || "[]")
        : [];

      if (
        userAllowedDomains.length > 0 &&
        !userAllowedDomains.includes("*") &&
        !userAllowedDomains.includes("all")
      ) {
        const isDomainAllowed = userAllowedDomains.some((d) => {
          const cleanAllowed = d.toLowerCase().trim();
          return (
            cleanAllowed === reqDomain ||
            (cleanAllowed.startsWith("*.") && reqDomain.endsWith(cleanAllowed.slice(1))) ||
            (reqDomain === "localhost" && (cleanAllowed === "127.0.0.1" || cleanAllowed === "localhost"))
          );
        });

        if (!isDomainAllowed) {
          recordFailedAttempt(rateLimitKey);
          await insertNeonLog({
            level: "warn",
            message: `Domain access blocked for user "${user.email}" on unauthorized domain "${reqDomain}". Allowed domains: [${userAllowedDomains.join(", ")}]`,
          });
          return res.status(403).json({
            success: false,
            error: `Access Denied: Your account is not permitted to log in from domain "${reqDomain}". Authorized domain(s): ${userAllowedDomains.join(", ")}.`,
          });
        }
      }

      // Verify cryptographic password hash
      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        recordFailedAttempt(rateLimitKey);
        await insertNeonLog({
          level: "warn",
          message: `Failed login attempt for user: ${email} from IP: ${clientIp}`,
        });
        return res
          .status(401)
          .json({ success: false, error: "Invalid email or password." });
      }

      // Success: reset failed attempts & update last_login
      resetAttempts(rateLimitKey);
      const lastLoginTime = new Date().toLocaleTimeString();
      await pool.query(
        "UPDATE neonUsers SET last_login = 'Just now' WHERE id = $1",
        [user.id],
      );

      // Issue signed session token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      await insertNeonLog({
        level: "success",
        message: `User authenticated successfully: ${user.name} (${user.email})`,
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          dailyLimit: user.daily_limit,
          usedToday: user.used_today,
          lastLogin: lastLoginTime,
          createdAt: user.created_at
            ? new Date(user.created_at).toISOString().split("T")[0]
            : "",
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin Login (Secure /vcon Authentication)
  app.post("/api/auth/admin-login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimitKey = `admin_${clientIp}`;

      // Check brute-force rate limiter
      const rateCheck = checkRateLimit(rateLimitKey);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `Security Lockout: Too many failed administrative attempts. Wait ${rateCheck.waitSeconds}s.`,
        });
      }

      if (!password) {
        return res
          .status(400)
          .json({ success: false, error: "Admin password is required." });
      }

      // Find admin user in Neon Postgres
      let adminRow = null;
      if (email && email.trim()) {
        const { rows } = await pool.query(
          "SELECT * FROM neonUsers WHERE LOWER(email) = LOWER($1) AND (LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%') LIMIT 1",
          [email.trim()],
        );
        if (rows.length > 0) adminRow = rows[0];
      } else {
        const { rows } = await pool.query(
          "SELECT * FROM neonUsers WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%' LIMIT 1",
        );
        if (rows.length > 0) adminRow = rows[0];
      }

      if (!adminRow) {
        recordFailedAttempt(rateLimitKey);
        return res
          .status(401)
          .json({ success: false, error: "Administrative record not found." });
      }

      // Check Allowed Domains restriction for admin user
      const reqDomain = (
        req.body.currentDomain ||
        (req.headers["x-forwarded-host"] as string)?.split(",")[0] ||
        (req.headers.host as string) ||
        ""
      )
        .split(":")[0]
        .toLowerCase()
        .trim();

      const adminAllowedDomains: string[] = Array.isArray(adminRow.allowed_domains)
        ? adminRow.allowed_domains
        : typeof adminRow.allowed_domains === "string"
        ? JSON.parse(adminRow.allowed_domains || "[]")
        : [];

      if (
        adminAllowedDomains.length > 0 &&
        !adminAllowedDomains.includes("*") &&
        !adminAllowedDomains.includes("all")
      ) {
        const isDomainAllowed = adminAllowedDomains.some((d) => {
          const cleanAllowed = d.toLowerCase().trim();
          return (
            cleanAllowed === reqDomain ||
            (cleanAllowed.startsWith("*.") && reqDomain.endsWith(cleanAllowed.slice(1))) ||
            (reqDomain === "localhost" && (cleanAllowed === "127.0.0.1" || cleanAllowed === "localhost"))
          );
        });

        if (!isDomainAllowed) {
          recordFailedAttempt(rateLimitKey);
          await insertNeonLog({
            level: "warn",
            message: `Admin access blocked for "${adminRow.email}" on unauthorized domain "${reqDomain}". Allowed domains: [${adminAllowedDomains.join(", ")}]`,
          });
          return res.status(403).json({
            success: false,
            error: `Access Denied: Your admin account is not permitted to log in from domain "${reqDomain}". Authorized domain(s): ${adminAllowedDomains.join(", ")}.`,
          });
        }
      }

      // Verify admin password
      const isValid = verifyPassword(password, adminRow.password_hash);
      if (!isValid) {
        recordFailedAttempt(rateLimitKey);
        await insertNeonLog({
          level: "error",
          message: `[SECURITY ALERT] Unauthorized admin access attempt on /vcon from IP: ${clientIp}`,
        });
        return res.status(401).json({
          success: false,
          error: "Invalid master administrator password.",
        });
      }

      // Reset attempts and update last_login
      resetAttempts(rateLimitKey);
      await pool.query(
        "UPDATE neonUsers SET last_login = 'Just now' WHERE id = $1",
        [adminRow.id],
      );

      const token = generateToken({
        id: adminRow.id,
        email: adminRow.email,
        role: "admin",
      });

      await insertNeonLog({
        level: "info",
        message: `Admin session verified and granted on /vcon (${adminRow.email})`,
      });

      return res.json({
        success: true,
        token,
        admin: {
          id: adminRow.id,
          name: adminRow.name,
          email: adminRow.email,
          role: adminRow.role,
          status: adminRow.status,
          dailyLimit: adminRow.daily_limit,
          usedToday: adminRow.used_today,
          lastLogin: "Just now",
          createdAt: adminRow.created_at
            ? new Date(adminRow.created_at).toISOString().split("T")[0]
            : "",
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Verify Active Session Token
  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : req.body.token;

      if (!token) {
        return res
          .status(401)
          .json({ valid: false, error: "No token provided" });
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return res
          .status(401)
          .json({ valid: false, error: "Invalid or expired session token" });
      }

      const { rows } = await pool.query(
        "SELECT * FROM neonUsers WHERE id = $1 LIMIT 1",
        [decoded.id],
      );
      if (rows.length === 0 || rows[0].status === "deactivated") {
        return res
          .status(403)
          .json({ valid: false, error: "User no longer active" });
      }

      const u = rows[0];
      return res.json({
        valid: true,
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          dailyLimit: u.daily_limit,
          usedToday: u.used_today,
          lastLogin: u.last_login,
          createdAt: u.created_at
            ? new Date(u.created_at).toISOString().split("T")[0]
            : "",
        },
      });
    } catch (err: any) {
      return res.status(500).json({ valid: false, error: err.message });
    }
  });

  // Change Password Endpoint (Updates Neon DB securely)
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : req.body.token;
      const { currentPassword, newPassword, userId } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: "New password must be at least 6 characters.",
        });
      }

      let targetUserId = userId;
      let requesterRole = "";
      if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
          targetUserId = decoded.id;
          requesterRole = decoded.role;
        }
      }

      if (!targetUserId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required to change password.",
        });
      }

      const { rows } = await pool.query(
        "SELECT * FROM neonUsers WHERE id = $1 LIMIT 1",
        [targetUserId],
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      const user = rows[0];

      // If user is changing their own password, current password must be provided and verified
      if (requesterRole !== "admin" || !userId || userId === user.id) {
        if (!currentPassword) {
          return res
            .status(400)
            .json({ success: false, error: "Current password is required." });
        }
        if (!verifyPassword(currentPassword, user.password_hash)) {
          return res
            .status(400)
            .json({ success: false, error: "Current password is incorrect." });
        }
      }

      // Hash new password with PBKDF2
      const newHash = hashPassword(newPassword);
      await pool.query(
        "UPDATE neonUsers SET password_hash = $1 WHERE id = $2",
        [newHash, user.id],
      );

      await insertNeonLog({
        level: "info",
        message: `Password updated securely for user: ${user.email} in Neon DB`,
      });

      return res.json({
        success: true,
        message: "Password updated successfully in Neon DB.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // CLOUDFLARE EDGE & NETWORK IP RESOLVER
  // ==========================================
  app.get(["/api/ip", "/api/client-ip"], (req: Request, res: Response) => {
    const cfConnectingIp = req.headers["cf-connecting-ip"] as string;
    const xForwardedFor = req.headers["x-forwarded-for"] as string;
    const xRealIp = req.headers["x-real-ip"] as string;
    const rawIp =
      cfConnectingIp ||
      (xForwardedFor ? xForwardedFor.split(",")[0].trim() : "") ||
      xRealIp ||
      req.socket?.remoteAddress ||
      "127.0.0.1";

    const cleanIp = rawIp.replace(/^::ffff:/, "");

    return res.json({
      ip: cleanIp,
      isCloudflare: Boolean(cfConnectingIp),
      country: (req.headers["cf-ipcountry"] as string) || null,
      colo: (req.headers["cf-ray"] ? (req.headers["cf-ray"] as string).split("-")[1] : null) || null,
    });
  });

  // ==========================================
  // NEON DATABASE STATUS & FORENSIC HEALTH CHECK
  // ==========================================
  app.get("/api/neon/health", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) {
        return res.json({
          connected: false,
          error: "Neon PostgreSQL database is not connected. Please provide a valid DATABASE_URL in environment or via Admin Settings.",
          endpoint: extractDbHost(DATABASE_URL),
          database: "None",
          user: "None",
          pgVersion: "N/A",
          latencyMs: 0,
          counts: { apis: 0, users: 0, tasks: 0, logs: 0 },
        });
      }
      const startTime = Date.now();
      const dbRes = await pool.query(`
        SELECT
          version() AS pg_version,
          current_database() AS database,
          currentUser AS user,
          inet_server_addr() AS server_addr,
          (SELECT COUNT(*) FROM neon_apis) AS apis_count,
          (SELECT COUNT(*) FROM neonUsers) AS users_count,
          (SELECT COUNT(*) FROM neon_tasks) AS tasks_count,
          (SELECT COUNT(*) FROM neon_logs) AS logs_count
      `);
      const latencyMs = Date.now() - startTime;

      return res.json({
        connected: true,
        endpoint: extractDbHost(DATABASE_URL),
        database: dbRes.rows[0].database,
        user: dbRes.rows[0].user,
        pgVersion: dbRes.rows[0].pg_version,
        latencyMs,
        counts: {
          apis: parseInt(dbRes.rows[0].apis_count, 10),
          users: parseInt(dbRes.rows[0].users_count, 10),
          tasks: parseInt(dbRes.rows[0].tasks_count, 10),
          logs: parseInt(dbRes.rows[0].logs_count, 10),
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        connected: false,
        error: err.message,
        endpoint: extractDbHost(DATABASE_URL),
      });
    }
  });

  // Test Neon Database connection endpoint
  app.post("/api/neon/test", async (req: Request, res: Response) => {
    try {
      const { connectionString } = req.body;
      const result = await testConnectionUri(connectionString);
      if (result.connected) {
        return res.json({
          connected: true,
          message: result.message,
          endpoint: result.endpoint,
          database: result.database,
          user: result.user,
          status: "ready",
          pingMs: result.pingMs,
        });
      } else {
        return res.status(400).json({
          connected: false,
          error: result.message,
          endpoint: result.endpoint,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        connected: false,
        error: `Neon connection error: ${err.message}`,
      });
    }
  });

  // ==========================================
  // APIS ENDPOINTS (NEON POSTGRES)
  // ==========================================
  let inMemoryApis: any[] = [];

  app.get("/api/apis", async (req: Request, res: Response) => {
    try {
      const userId = (req.query.userId as string | undefined) || "";
      if (!hasRealDatabaseUrl) {
        const filtered = userId
          ? inMemoryApis.filter((a) => !a.userId || a.userId === userId)
          : inMemoryApis;
        return res.json(filtered);
      }
      const query = userId
        ? "SELECT * FROM neon_apis WHERE user_id = $1 OR user_id = '' ORDER BY created_at DESC"
        : "SELECT * FROM neon_apis ORDER BY created_at DESC";
      const params = userId ? [userId] : [];
      const { rows } = await pool.query(query, params);
      const formatted = rows.map((r) => ({
        id: r.id,
        userId: r.user_id || "",
        name: r.name,
        key: r.key || "",
        senderEmail: r.sender_email,
        dailyLimit: Number(r.daily_limit) || 1000,
        usedToday: Number(r.used_today) || 0,
        status: r.status || "active",
        lastTested: r.last_tested || "",
        testStatusMsg: r.test_status_msg || "",
        providerType: r.provider_type || "resend",
        provider_type: r.provider_type || "resend",
        smtpHost: r.smtp_host || "",
        smtp_host: r.smtp_host || "",
        smtpPort: Number(r.smtp_port) || 587,
        smtp_port: Number(r.smtp_port) || 587,
        smtpSecure: Boolean(r.smtp_secure),
        smtp_secure: Boolean(r.smtp_secure),
        smtpUser: r.smtp_user || "",
        smtp_user: r.smtp_user || "",
        smtpPass: r.smtp_pass || "",
        smtp_pass: r.smtp_pass || "",
        createdAt: r.created_at
          ? (typeof r.created_at === "string"
              ? r.created_at.split("T")[0]
              : new Date(r.created_at).toISOString().split("T")[0])
          : "",
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/apis", async (req: Request, res: Response) => {
    try {
      const {
        id: customId,
        name,
        key,
        senderEmail,
        dailyLimit,
        usedToday,
        status,
        lastTested,
        testStatusMsg,
        userId,
        providerType,
        provider_type,
        smtpHost,
        smtp_host,
        smtpPort,
        smtp_port,
        smtpSecure,
        smtp_secure,
        smtpUser,
        smtp_user,
        smtpPass,
        smtp_pass,
      } = req.body;

      const provider = providerType || provider_type || (smtpHost || smtp_host ? "smtp" : "resend");
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Channel name is required." });
      }

      if (provider === "resend" && (!key || !key.trim())) {
        return res.status(400).json({ error: "Resend API Key is required." });
      }

      const effectiveHost = smtpHost || smtp_host || "";
      const effectivePort = Number(smtpPort || smtp_port) || 587;
      const effectiveSecure = smtpSecure !== undefined ? Boolean(smtpSecure) : (smtp_secure !== undefined ? Boolean(smtp_secure) : effectivePort === 465);
      const effectiveUser = smtpUser || smtp_user || "";
      const effectivePass = smtpPass !== undefined ? smtpPass : (smtp_pass || "");
      const effectiveSender = senderEmail?.trim() || effectiveUser || "";

      if (provider === "smtp" && (!effectiveHost || !effectiveUser)) {
        return res.status(400).json({ error: "SMTP Host and Username are required for custom SMTP channel." });
      }

      const id = customId || `api_${provider}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString().split("T")[0];

      if (!hasRealDatabaseUrl) {
        const memoryApi = {
          id,
          userId: userId || "",
          name: name.trim(),
          key: (key || "").trim(),
          senderEmail: effectiveSender,
          dailyLimit: Number(dailyLimit) || 1000,
          usedToday: Number(usedToday) || 0,
          status: status || "active",
          lastTested: lastTested || "Just now",
          testStatusMsg: testStatusMsg || "",
          providerType: provider,
          provider_type: provider,
          smtpHost: effectiveHost,
          smtp_host: effectiveHost,
          smtpPort: effectivePort,
          smtp_port: effectivePort,
          smtpSecure: effectiveSecure,
          smtp_secure: effectiveSecure,
          smtp_user: effectiveUser,
          smtpPass: effectivePass,
          smtp_pass: effectivePass,
          createdAt: nowIso,
        };
        inMemoryApis.unshift(memoryApi);
        return res.json(memoryApi);
      }

      const { rows } = await pool.query(
        `INSERT INTO neon_apis (
           id, user_id, name, key, sender_email, daily_limit, used_today, status,
           last_tested, test_status_msg, provider_type, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          id,
          userId || "",
          name.trim(),
          (key || "").trim(),
          effectiveSender,
          Number(dailyLimit) || 1000,
          Number(usedToday) || 0,
          status || "active",
          lastTested || "Just now",
          testStatusMsg || "",
          provider,
          effectiveHost,
          effectivePort,
          effectiveSecure,
          effectiveUser,
          effectivePass,
        ],
      );

      await insertNeonLog({
        level: "success",
        apiName: name,
        message: `Registered new ${provider.toUpperCase()} channel in Neon Postgres: "${name}" (${effectiveSender || effectiveHost})`,
      });

      const r = rows[0];
      res.json({
        id: r.id,
        userId: r.user_id || "",
        name: r.name,
        key: r.key,
        senderEmail: r.sender_email,
        dailyLimit: Number(r.daily_limit) || 1000,
        usedToday: Number(r.used_today) || 0,
        status: r.status,
        lastTested: r.last_tested,
        testStatusMsg: r.test_status_msg,
        providerType: r.provider_type || "resend",
        provider_type: r.provider_type || "resend",
        smtpHost: r.smtp_host || "",
        smtp_host: r.smtp_host || "",
        smtpPort: Number(r.smtp_port) || 587,
        smtp_port: Number(r.smtp_port) || 587,
        smtpSecure: Boolean(r.smtp_secure),
        smtp_secure: Boolean(r.smtp_secure),
        smtpUser: r.smtp_user || "",
        smtp_user: r.smtp_user || "",
        smtpPass: r.smtp_pass || "",
        smtp_pass: r.smtp_pass || "",
        createdAt: nowIso,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/apis/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        key,
        senderEmail,
        dailyLimit,
        usedToday,
        status,
        lastTested,
        testStatusMsg,
        userId,
        providerType,
        provider_type,
        smtpHost,
        smtp_host,
        smtpPort,
        smtp_port,
        smtpSecure,
        smtp_secure,
        smtpUser,
        smtp_user,
        smtpPass,
        smtp_pass,
      } = req.body;

      evictChannel(id);

      const targetProvider = providerType || provider_type;
      const targetHost = smtpHost !== undefined ? smtpHost : smtp_host;
      const targetPort = smtpPort !== undefined ? Number(smtpPort) : (smtp_port !== undefined ? Number(smtp_port) : undefined);
      const targetSecure = smtpSecure !== undefined ? Boolean(smtpSecure) : (smtp_secure !== undefined ? Boolean(smtp_secure) : undefined);
      const targetUser = smtpUser !== undefined ? smtpUser : smtp_user;
      const targetPass = smtpPass !== undefined ? smtpPass : smtp_pass;

      if (!hasRealDatabaseUrl) {
        const existingIdx = inMemoryApis.findIndex((a) => a.id === id);
        if (existingIdx >= 0) {
          inMemoryApis[existingIdx] = {
            ...inMemoryApis[existingIdx],
            ...req.body,
          };
          return res.json(inMemoryApis[existingIdx]);
        }
        return res.status(404).json({ error: "API not found" });
      }

      const { rows } = await pool.query(
        `UPDATE neon_apis
         SET user_id = COALESCE($1, user_id),
             name = COALESCE($2, name),
             key = COALESCE($3, key),
             sender_email = COALESCE($4, sender_email),
             daily_limit = COALESCE($5, daily_limit),
             used_today = COALESCE($6, used_today),
             status = COALESCE($7, status),
             last_tested = COALESCE($8, last_tested),
             test_status_msg = COALESCE($9, test_status_msg),
             provider_type = COALESCE($10, provider_type),
             smtp_host = COALESCE($11, smtp_host),
             smtp_port = COALESCE($12, smtp_port),
             smtp_secure = COALESCE($13, smtp_secure),
             smtp_user = COALESCE($14, smtp_user),
             smtp_pass = COALESCE($15, smtp_pass)
         WHERE id = $16
         RETURNING *`,
        [
          userId ?? null,
          name ?? null,
          key ?? null,
          senderEmail ?? null,
          dailyLimit !== undefined ? Number(dailyLimit) : null,
          usedToday !== undefined ? Number(usedToday) : null,
          status ?? null,
          lastTested ?? null,
          testStatusMsg ?? null,
          targetProvider ?? null,
          targetHost ?? null,
          targetPort ?? null,
          targetSecure ?? null,
          targetUser ?? null,
          targetPass ?? null,
          id,
        ],
      );

      if (rows.length === 0)
        return res.status(404).json({ error: "API not found" });
      const r = rows[0];
      res.json({
        id: r.id,
        userId: r.user_id || "",
        name: r.name,
        key: r.key,
        senderEmail: r.sender_email,
        dailyLimit: Number(r.daily_limit) || 1000,
        usedToday: Number(r.used_today) || 0,
        status: r.status,
        lastTested: r.last_tested,
        testStatusMsg: r.test_status_msg,
        providerType: r.provider_type || "resend",
        provider_type: r.provider_type || "resend",
        smtpHost: r.smtp_host || "",
        smtp_host: r.smtp_host || "",
        smtpPort: Number(r.smtp_port) || 587,
        smtp_port: Number(r.smtp_port) || 587,
        smtpSecure: Boolean(r.smtp_secure),
        smtp_secure: Boolean(r.smtp_secure),
        smtpUser: r.smtp_user || "",
        smtp_user: r.smtp_user || "",
        smtpPass: r.smtp_pass || "",
        smtp_pass: r.smtp_pass || "",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/apis/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      evictChannel(id);
      if (!hasRealDatabaseUrl) {
        inMemoryApis = inMemoryApis.filter((a) => a.id !== id);
        return res.json({ success: true });
      }
      await pool.query("DELETE FROM neon_apis WHERE id = $1", [id]);
      await insertNeonLog({
        level: "warn",
        message: `Deleted sender channel (${id}) from Neon database`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Verify custom SMTP connection endpoint
  app.post("/api/smtp/verify", async (req: Request, res: Response) => {
    try {
      const {
        smtpHost,
        smtp_host,
        smtpPort,
        smtp_port,
        smtpSecure,
        smtp_secure,
        smtpUser,
        smtp_user,
        smtpPass,
        smtp_pass,
        senderEmail,
      } = req.body;

      const host = smtpHost || smtp_host;
      const port = Number(smtpPort || smtp_port) || 587;
      const secure = smtpSecure !== undefined ? Boolean(smtpSecure) : (smtp_secure !== undefined ? Boolean(smtp_secure) : port === 465);
      const user = smtpUser || smtp_user;
      const pass = smtpPass !== undefined ? smtpPass : (smtp_pass || "");

      if (!host || !user) {
        return res.status(400).json({
          success: false,
          message: "SMTP Host and Username are required for verification",
        });
      }

      const verifyRes = await verifyChannel({
        id: "test_probe",
        name: "Probe",
        provider_type: "smtp",
        sender_email: senderEmail || user,
        smtp_host: host,
        smtp_port: port,
        smtp_secure: secure,
        smtp_user: user,
        smtp_pass: pass,
      });

      return res.json(verifyRes);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || "Failed to verify SMTP server",
      });
    }
  });

  // ==========================================
  // CONTENT ENDPOINTS (NEON POSTGRES)
  // ==========================================
  app.get("/api/content", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) {
        return res.json({
          senderNames: ["Support Team"],
          subjects: ["Hello {name}"],
          bodyHtml: "<p>Hello {name}</p>",
          bodyText: "Hello {name}",
          attachments: [],
          replyTo: "",
          unsubscribeUrl: "",
          enableOneClickUnsubscribe: true,
        });
      }
      const { rows } = await pool.query("SELECT * FROM neon_content LIMIT 1");
      if (rows.length === 0) {
        return res.json({
          senderNames: ["Support Team"],
          subjects: ["Hello {name}"],
          bodyHtml: "<p>Hello {name}</p>",
          bodyText: "Hello {name}",
          attachments: [],
          replyTo: "",
          unsubscribeUrl: "",
          enableOneClickUnsubscribe: true,
        });
      }
      const r = rows[0];
      res.json({
        senderNames: r.sender_names,
        subjects: r.subjects,
        bodyHtml: r.body_html,
        bodyText: r.body_text,
        attachments: r.attachments || [],
        trackOpens: Boolean(r.track_opens),
        trackClicks: Boolean(r.track_clicks),
        replyTo: r.reply_to || "",
        autoReplyTo: r.auto_reply_to !== false,
        unsubscribeUrl: r.unsubscribe_url || "",
        enableOneClickUnsubscribe: r.enable_one_click_unsubscribe ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content", async (req: Request, res: Response) => {
    try {
      const {
        senderNames,
        subjects,
        bodyHtml,
        bodyText,
        attachments,
        trackOpens,
        trackClicks,
        replyTo,
        autoReplyTo,
        unsubscribeUrl,
        enableOneClickUnsubscribe,
      } = req.body;

      const sanitizedAttachments = (attachments || []).map(
        (attachment: any) => ({
          id: attachment?.id,
          name: attachment?.name,
          size: attachment?.size,
          type: attachment?.type,
          url: attachment?.url,
          s3Key: attachment?.s3Key,
          uploadedAt: attachment?.uploadedAt,
        }),
      );

      const cleanReplyTo = replyTo !== undefined ? sanitizeReplyTo(replyTo) || "" : null;
      const cleanAutoReplyTo = autoReplyTo !== undefined ? Boolean(autoReplyTo) : true;
      const cleanUnsubUrl = unsubscribeUrl !== undefined ? sanitizeHeaderValue(unsubscribeUrl) : null;
      const cleanOneClick = enableOneClickUnsubscribe !== undefined ? Boolean(enableOneClickUnsubscribe) : true;

      await pool.query(
        `INSERT INTO neon_content (id, sender_names, subjects, body_html, body_text, attachments, track_opens, track_clicks, reply_to, auto_reply_to, unsubscribe_url, enable_one_click_unsubscribe, updated_at)
         VALUES ('default_content', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (id) DO UPDATE
         SET sender_names = EXCLUDED.sender_names,
             subjects = EXCLUDED.subjects,
             body_html = EXCLUDED.body_html,
             body_text = EXCLUDED.body_text,
             attachments = EXCLUDED.attachments,
             track_opens = EXCLUDED.track_opens,
             track_clicks = EXCLUDED.track_clicks,
             reply_to = COALESCE(EXCLUDED.reply_to, neon_content.reply_to),
             auto_reply_to = COALESCE(EXCLUDED.auto_reply_to, neon_content.auto_reply_to),
             unsubscribe_url = COALESCE(EXCLUDED.unsubscribe_url, neon_content.unsubscribe_url),
             enable_one_click_unsubscribe = COALESCE(EXCLUDED.enable_one_click_unsubscribe, neon_content.enable_one_click_unsubscribe),
             updated_at = NOW()`,
        [
          JSON.stringify(senderNames || []),
          JSON.stringify(subjects || []),
          bodyHtml || "",
          bodyText || "",
          JSON.stringify(sanitizedAttachments),
          Boolean(trackOpens),
          Boolean(trackClicks),
          cleanReplyTo,
          cleanAutoReplyTo,
          cleanUnsubUrl,
          cleanOneClick,
        ],
      );
      await insertNeonLog({
        level: "info",
        message: "Updated email templates & content in Neon Postgres",
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // PRESETS & TEMPLATES ENDPOINTS (NEON POSTGRES)
  // ==========================================
  let inMemoryPresets: any[] = [
    {
      id: "invoice_standard",
      title: "Service Billing Statement",
      sender: "Billing Department",
      subject: "Statement for {company} — Ref {order_ref}",
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">\n  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">\n    <h2 style="color: #0f172a; margin: 0; font-size: 18px; font-weight: 600;">Service Statement</h2>\n    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Reference: {order_ref} · {date}</p>\n  </div>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">\n    Hello {first_name},\n  </p>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">\n    Here is the billing statement for services provided to <strong>{company}</strong> for the current period.\n  </p>\n  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">\n    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Account:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Statement Ref:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Issue Date:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Status:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #16a34a;">Processed</td>\n      </tr>\n    </table>\n  </div>\n  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">\n    If you have any questions regarding this statement, please feel free to reply directly to this email.\n  </p>\n  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">\n    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>\n  </div>\n</div>`,
      text: "Hello {first_name},\n\nHere is the billing statement for services provided to {company} for the current period.\n\nAccount: {company}\nStatement Ref: {order_ref}\nIssue Date: {date}\nStatus: Processed\n\nIf you have any questions regarding this statement, please feel free to reply directly to this email.\n\nSent by {sender_company} · {company_address}",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "invoice_receipt",
      title: "Subscription Renewal Receipt",
      sender: "Accounts Team",
      subject: "Receipt for your subscription renewal — {order_ref}",
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">\n  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">\n    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; background-color: #eef2ff; padding: 3px 8px; border-radius: 4px;">Payment Receipt</span>\n    <h2 style="color: #0f172a; margin: 10px 0 0 0; font-size: 18px; font-weight: 600;">Subscription Confirmed</h2>\n  </div>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">\n    Hi {first_name},\n  </p>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">\n    Thank you for your continued partnership. This email confirms that your subscription for <strong>{company}</strong> has been successfully renewed.\n  </p>\n  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">\n    <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Receipt Summary</div>\n    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">\n      <tr>\n        <td style="padding: 5px 0; color: #64748b;">Receipt Number:</td>\n        <td style="padding: 5px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>\n      </tr>\n      <tr>\n        <td style="padding: 5px 0; color: #64748b;">Client:</td>\n        <td style="padding: 5px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>\n      </tr>\n      <tr>\n        <td style="padding: 5px 0; color: #64748b;">Date:</td>\n        <td style="padding: 5px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>\n      </tr>\n      <tr>\n        <td style="padding: 5px 0; color: #64748b;">Reference ID:</td>\n        <td style="padding: 5px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{reference_id}</td>\n      </tr>\n    </table>\n  </div>\n  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">\n    Your service remains active without interruption. All past statements and invoices are accessible anytime.\n  </p>\n  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">\n    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>\n  </div>\n</div>`,
      text: "Hi {first_name},\n\nThank you for your continued partnership. This email confirms that your subscription for {company} has been successfully renewed.\n\nReceipt Number: {order_ref}\nClient: {company}\nDate: {date}\nReference ID: {reference_id}\n\nYour service remains active without interruption. All past statements and invoices are accessible anytime.\n\nSent by {sender_company} · {company_address}",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "invoice_delivery",
      title: "Service Delivery & Milestone Invoice",
      sender: "Finance Operations",
      subject: "Invoice for completed milestone #{ticket_id} — {company}",
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">\n  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">\n    <h2 style="color: #0f172a; margin: 0; font-size: 18px; font-weight: 600;">Service Delivery Invoice</h2>\n    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Milestone Ref: #{ticket_id} · {date}</p>\n  </div>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">\n    Dear {first_name},\n  </p>\n  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">\n    The recent project milestone deliverables for <strong>{company}</strong> have been finalized. Please find the details for your records below:\n  </p>\n  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">\n    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Project / Account:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Milestone Code:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{ticket_id}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Order Ref:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>\n      </tr>\n      <tr>\n        <td style="padding: 6px 0; color: #64748b;">Billing Date:</td>\n        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>\n      </tr>\n    </table>\n  </div>\n  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">\n    Thank you for choosing our services. Please reach out if you need itemized breakdown adjustments or tax documentation.\n  </p>\n  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">\n    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>\n  </div>\n</div>`,
      text: "Dear {first_name},\n\nThe recent project milestone deliverables for {company} have been finalized. Please find the details for your records below:\n\nProject / Account: {company}\nMilestone Code: #{ticket_id}\nOrder Ref: {order_ref}\nBilling Date: {date}\n\nThank you for choosing our services. Please reach out if you need itemized breakdown adjustments or tax documentation.\n\nSent by {sender_company} · {company_address}",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  app.get("/api/presets", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) {
        return res.json(inMemoryPresets);
      }
      const { rows } = await pool.query(
        "SELECT * FROM neon_presets ORDER BY created_at DESC",
      );
      const formatted = rows.map((r) => ({
        id: r.id,
        title: r.title,
        sender: r.sender,
        subject: r.subject,
        html: r.html || "",
        text: r.text || "",
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/presets", async (req: Request, res: Response) => {
    try {
      const { id, title, sender, subject, html, text, createdBy } = req.body;
      const presetId = id || `preset_${Date.now()}`;
      const presetTitle = title || "Untitled Preset";
      const presetSender = sender || "R Sender Support";
      const presetSubject = subject || "Update for {name}";
      const presetHtml = html || "";
      const presetText = text || "";
      const presetCreatedBy = createdBy || "user";

      if (!hasRealDatabaseUrl) {
        const existingIdx = inMemoryPresets.findIndex((p) => p.id === presetId);
        const newPreset = {
          id: presetId,
          title: presetTitle,
          sender: presetSender,
          subject: presetSubject,
          html: presetHtml,
          text: presetText,
          createdBy: presetCreatedBy,
          createdAt: existingIdx >= 0 ? inMemoryPresets[existingIdx].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          inMemoryPresets[existingIdx] = newPreset;
        } else {
          inMemoryPresets.unshift(newPreset);
        }
        return res.json(newPreset);
      }

      const { rows } = await pool.query(
        `INSERT INTO neon_presets (id, title, sender, subject, html, text, created_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             sender = EXCLUDED.sender,
             subject = EXCLUDED.subject,
             html = EXCLUDED.html,
             text = EXCLUDED.text,
             updated_at = NOW()
         RETURNING *`,
        [presetId, presetTitle, presetSender, presetSubject, presetHtml, presetText, presetCreatedBy],
      );

      const r = rows[0];
      const result = {
        id: r.id,
        title: r.title,
        sender: r.sender,
        subject: r.subject,
        html: r.html || "",
        text: r.text || "",
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };

      await insertNeonLog({
        level: "info",
        message: `Saved email preset "${presetTitle}" in Neon Postgres`,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/presets/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!hasRealDatabaseUrl) {
        inMemoryPresets = inMemoryPresets.filter((p) => p.id !== id);
        return res.json({ success: true });
      }
      await pool.query("DELETE FROM neon_presets WHERE id = $1", [id]);
      await insertNeonLog({
        level: "info",
        message: `Deleted email preset "${id}" from Neon Postgres`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // TASKS ENDPOINTS (NEON POSTGRES)
  // ==========================================
  let inMemoryTasks: any[] = [];

  app.get("/api/tasks", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) return res.json(inMemoryTasks);
      const { rows } = await pool.query(
        "SELECT * FROM neon_tasks ORDER BY created_at DESC",
      );
      const formatted = rows.map((r) => ({
        id: r.id,
        userId: r.user_id || "",
        name: r.name,
        status: r.status || "idle",
        apiIds: r.api_ids || [],
        recipients: r.recipients || [],
        stats: r.stats || { total: 0, success: 0, failed: 0, remaining: 0 },
        currentLog: r.current_log || "",
        progress: r.progress || 0,
        delayMs: r.delay_ms || 800,
        senderName: r.sender_name || "",
        subject: r.subject || "",
        bodyHtml: r.body_html || "",
        bodyText: r.body_text || "",
        replyTo: r.reply_to || "",
        unsubscribeUrl: r.unsubscribe_url || "",
        enableOneClickUnsubscribe: r.enable_one_click_unsubscribe ?? true,
        attachmentsCount: r.attachments_count || 0,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString() : "",
        startedAt: r.started_at,
        completedAt: r.completed_at,
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks", async (req: Request, res: Response) => {
    try {
      const {
        userId,
        name,
        apiIds,
        recipients,
        delayMs,
        senderName,
        subject,
        bodyHtml,
        bodyText,
        attachmentsCount,
        replyTo,
        unsubscribeUrl,
        enableOneClickUnsubscribe,
      } = req.body;
      const recList = Array.isArray(recipients) ? recipients : [];
      const id = req.body.id || `task_neon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const taskUserId = userId || "";
      const stats = req.body.stats || {
        total: recList.length,
        success: 0,
        failed: 0,
        remaining: recList.length,
      };
      const initialLog = req.body.currentLog || `Task created with ${stats.total} recipients. Ready to run.`;
      const taskName = name || "Untitled Task";
      const taskDelay = delayMs !== undefined ? delayMs : 800;
      const taskApiIds = apiIds || [];
      const cleanTaskReplyTo = replyTo ? sanitizeReplyTo(replyTo) || "" : "";
      const cleanTaskUnsubUrl = unsubscribeUrl ? sanitizeHeaderValue(unsubscribeUrl) : "";
      const cleanTaskOneClick = enableOneClickUnsubscribe !== undefined ? Boolean(enableOneClickUnsubscribe) : true;

      if (!hasRealDatabaseUrl) {
        const memoryTask = {
          id,
          userId: taskUserId,
          name: taskName,
          status: "idle",
          apiIds: taskApiIds,
          recipients: recList,
          stats,
          currentLog: initialLog,
          progress: 0,
          delayMs: taskDelay,
          senderName: senderName || "",
          subject: subject || "",
          bodyHtml: bodyHtml || "",
          bodyText: bodyText || "",
          replyTo: cleanTaskReplyTo,
          unsubscribeUrl: cleanTaskUnsubUrl,
          enableOneClickUnsubscribe: cleanTaskOneClick,
          attachmentsCount: attachmentsCount || 0,
          createdAt: new Date().toISOString(),
        };
        inMemoryTasks.unshift(memoryTask);
        return res.json(memoryTask);
      }

      const { rows } = await pool.query(
        `INSERT INTO neon_tasks (
          id, user_id, name, status, api_ids, recipients, stats, current_log, progress, delay_ms,
          sender_name, subject, body_html, body_text, attachments_count, reply_to, unsubscribe_url, enable_one_click_unsubscribe
        ) VALUES ($1, $2, $3, 'idle', $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          id,
          taskUserId,
          taskName,
          JSON.stringify(taskApiIds),
          JSON.stringify(recList),
          JSON.stringify(stats),
          initialLog,
          taskDelay,
          senderName || "",
          subject || "",
          bodyHtml || "",
          bodyText || "",
          attachmentsCount || 0,
          cleanTaskReplyTo,
          cleanTaskUnsubUrl,
          cleanTaskOneClick,
        ],
      );

      await insertNeonLog({
        level: "info",
        userId: taskUserId,
        taskName: taskName,
        taskId: id,
        message: `Created bulk task "${taskName}" with ${stats.total} recipients in Neon DB`,
      });

      const r = rows[0];
      res.json({
        id: r.id,
        userId: r.user_id || taskUserId,
        name: r.name,
        status: r.status || "idle",
        apiIds: r.api_ids || taskApiIds,
        recipients: r.recipients || recList,
        stats: r.stats || stats,
        currentLog: r.current_log || initialLog,
        progress: r.progress || 0,
        delayMs: r.delay_ms || taskDelay,
        senderName: r.sender_name || senderName || "",
        subject: r.subject || subject || "",
        bodyHtml: r.body_html || bodyHtml || "",
        bodyText: r.body_text || bodyText || "",
        attachmentsCount: r.attachments_count || attachmentsCount || 0,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString() : new Date().toISOString(),
        startedAt: r.started_at,
        completedAt: r.completed_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        status,
        apiIds,
        recipients,
        stats,
        currentLog,
        progress,
        delayMs,
        senderName,
        subject,
        bodyHtml,
        bodyText,
        attachmentsCount,
        startedAt,
        completedAt,
      } = req.body;

      if (!hasRealDatabaseUrl) {
        const existingIdx = inMemoryTasks.findIndex((t) => t.id === id);
        if (existingIdx >= 0) {
          inMemoryTasks[existingIdx] = { ...inMemoryTasks[existingIdx], ...req.body };
        }
        return res.json({ success: true });
      }

      await pool.query(
        `UPDATE neon_tasks
         SET name = COALESCE($1, name),
             status = COALESCE($2, status),
             api_ids = COALESCE($3::jsonb, api_ids),
             recipients = COALESCE($4::jsonb, recipients),
             stats = COALESCE($5::jsonb, stats),
             current_log = COALESCE($6, current_log),
             progress = COALESCE($7, progress),
             delay_ms = COALESCE($8, delay_ms),
             sender_name = COALESCE($9, sender_name),
             subject = COALESCE($10, subject),
             body_html = COALESCE($11, body_html),
             body_text = COALESCE($12, body_text),
             attachments_count = COALESCE($13, attachments_count),
             started_at = COALESCE($14, started_at),
             completed_at = COALESCE($15, completed_at)
         WHERE id = $16`,
        [
          name || null,
          status || null,
          apiIds ? JSON.stringify(apiIds) : null,
          recipients ? JSON.stringify(recipients) : null,
          stats ? JSON.stringify(stats) : null,
          currentLog || null,
          progress !== undefined ? progress : null,
          delayMs !== undefined ? delayMs : null,
          senderName || null,
          subject || null,
          bodyHtml || null,
          bodyText || null,
          attachmentsCount !== undefined ? attachmentsCount : null,
          startedAt || null,
          completedAt || null,
          id,
        ],
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!hasRealDatabaseUrl) {
        inMemoryTasks = inMemoryTasks.filter((t) => t.id !== id);
        return res.json({ success: true });
      }
      await pool.query("DELETE FROM neon_tasks WHERE id = $1", [id]);
      await insertNeonLog({
        level: "warn",
        message: `Deleted task (${id}) from Neon database`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // USERS ENDPOINTS (NEON POSTGRES)
  // ==========================================
  app.get("/api/users", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) return res.json([]);
      const { rows } = await pool.query(
        "SELECT id, name, email, role, status, daily_limit, used_today, last_login, allowed_domains, created_at FROM neonUsers ORDER BY created_at ASC",
      );
      const formatted = rows.map((r) => {
        let parsedAllowedDomains: string[] = [];
        if (Array.isArray(r.allowed_domains)) {
          parsedAllowedDomains = r.allowed_domains;
        } else if (typeof r.allowed_domains === "string") {
          try {
            parsedAllowedDomains = JSON.parse(r.allowed_domains);
          } catch {
            parsedAllowedDomains = [];
          }
        }
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
          status: r.status,
          dailyLimit: r.daily_limit,
          usedToday: r.used_today,
          lastLogin: r.last_login,
          allowedDomains: parsedAllowedDomains,
          createdAt: r.created_at
            ? new Date(r.created_at).toISOString().split("T")[0]
            : "",
        };
      });
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const { name, email, password, role, dailyLimit, status, allowedDomains } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: "Email address is required." });
      }
      if (!password || !password.trim()) {
        return res
          .status(400)
          .json({ error: "A secure password is required to create a user." });
      }
      const id = `u_neon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const passwordHash = hashPassword(password.trim());
      const safeAllowedDomains = Array.isArray(allowedDomains) ? allowedDomains : [];

      const { rows } = await pool.query(
        `INSERT INTO neonUsers (id, name, email, password_hash, role, status, daily_limit, used_today, last_login, allowed_domains)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'Never', $8::jsonb)
         RETURNING id, name, email, role, status, daily_limit, used_today, last_login, allowed_domains, created_at`,
        [
          id,
          name,
          email.toLowerCase(),
          passwordHash,
          role || "user",
          status || "active",
          dailyLimit || 5000,
          JSON.stringify(safeAllowedDomains),
        ],
      );
      await insertNeonLog({
        level: "info",
        message: `Admin created user in Neon DB: ${name} (${email}) with allowed domains: [${safeAllowedDomains.join(", ") || "Global"}]`,
      });
      const r = rows[0];
      res.json({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        dailyLimit: r.daily_limit,
        usedToday: 0,
        lastLogin: "Never",
        allowedDomains: safeAllowedDomains,
        createdAt: new Date().toISOString().split("T")[0],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, password, role, status, dailyLimit, usedToday, allowedDomains } =
        req.body;

      const safeAllowedDomainsJson = allowedDomains !== undefined ? JSON.stringify(Array.isArray(allowedDomains) ? allowedDomains : []) : null;

      let passwordClause = "";
      const params: any[] = [
        name ?? null,
        email ? email.toLowerCase() : null,
        role ?? null,
        status ?? null,
        dailyLimit ?? null,
        usedToday ?? null,
        safeAllowedDomainsJson,
        id,
      ];

      if (password && password.trim()) {
        const passwordHash = hashPassword(password.trim());
        params.unshift(passwordHash);
        passwordClause = ", password_hash = $1";
      }

      const queryText = passwordClause
        ? `UPDATE neonUsers
           SET password_hash = $1,
               name = COALESCE($2, name),
               email = COALESCE($3, email),
               role = COALESCE($4, role),
               status = COALESCE($5, status),
               daily_limit = COALESCE($6, daily_limit),
               used_today = COALESCE($7, used_today),
               allowed_domains = COALESCE($8::jsonb, allowed_domains)
           WHERE id = $9
           RETURNING id, name, email, role, status, daily_limit, used_today, last_login, allowed_domains, created_at`
        : `UPDATE neonUsers
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               role = COALESCE($3, role),
               status = COALESCE($4, status),
               daily_limit = COALESCE($5, daily_limit),
               used_today = COALESCE($6, used_today),
               allowed_domains = COALESCE($7::jsonb, allowed_domains)
           WHERE id = $8
           RETURNING id, name, email, role, status, daily_limit, used_today, last_login, allowed_domains, created_at`;

      const { rows } = await pool.query(queryText, params);
      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      const r = rows[0];
      let parsedAllowed: string[] = [];
      if (Array.isArray(r.allowed_domains)) {
        parsedAllowed = r.allowed_domains;
      } else if (typeof r.allowed_domains === "string") {
        try {
          parsedAllowed = JSON.parse(r.allowed_domains);
        } catch {
          parsedAllowed = [];
        }
      }
      res.json({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        dailyLimit: r.daily_limit,
        usedToday: r.used_today,
        lastLogin: r.last_login,
        allowedDomains: parsedAllowed,
        createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM neonUsers WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // DOMAINS & MULTI-TENANCY ANALYSIS (NEON POSTGRES)
  // ==========================================
  app.get("/api/domains", async (req: Request, res: Response) => {
    try {
      const currentHost = (
        (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ||
        req.headers.host?.split(":")[0]?.trim() ||
        "localhost"
      ).toLowerCase();

      if (!hasRealDatabaseUrl) {
        return res.json({
          currentHost,
          domains: [],
        });
      }

      // Automatically register or update activity for current incoming host
      if (currentHost && currentHost !== "localhost" && !currentHost.startsWith("127.")) {
        const id = `dom_${currentHost.replace(/[^a-z0-9]/gi, "_")}`;
        const isCf = currentHost.includes("pages.dev");
        await pool.query(
          `INSERT INTO neon_domains (id, domain, source, domain_type, status, is_verified, request_count, last_active_at)
           VALUES ($1, $2, 'auto', $3, 'active', true, 1, CURRENT_TIMESTAMP)
           ON CONFLICT (domain) DO UPDATE
           SET request_count = neon_domains.request_count + 1,
               last_active_at = CURRENT_TIMESTAMP`,
          [id, currentHost, isCf ? "cloudflare_pages" : "custom"]
        ).catch(() => {});
      }

      const { rows } = await pool.query(
        "SELECT id, domain, source, domain_type, status, is_verified, request_count, last_active_at, created_at FROM neon_domains ORDER BY last_active_at DESC",
      );

      const formatted = rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        source: r.source || "auto",
        domainType: r.domain_type || "custom",
        domain_type: r.domain_type || "custom",
        status: r.status || "active",
        isVerified: Boolean(r.is_verified),
        requestCount: Number(r.request_count) || 0,
        lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toLocaleString() : "",
        createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
      }));

      return res.json({
        currentHost,
        domains: formatted,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message, domains: [] });
    }
  });

  app.post("/api/domains", async (req: Request, res: Response) => {
    try {
      const { domain, domainType, status } = req.body;
      if (!domain || !domain.trim()) {
        return res.status(400).json({ error: "Domain hostname is required." });
      }

      const cleanDomain = domain.trim().replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
      const id = `dom_${cleanDomain.replace(/[^a-z0-9]/gi, "_")}`;
      const type = domainType || (cleanDomain.includes("pages.dev") ? "cloudflare_pages" : "custom");

      const { rows } = await pool.query(
        `INSERT INTO neon_domains (id, domain, source, domain_type, status, is_verified, request_count, last_active_at)
         VALUES ($1, $2, 'manual', $3, $4, true, 0, CURRENT_TIMESTAMP)
         ON CONFLICT (domain) DO UPDATE
         SET domain_type = EXCLUDED.domain_type,
             status = EXCLUDED.status,
             last_active_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [id, cleanDomain, type, status || "active"]
      );

      await insertNeonLog({
        level: "info",
        message: `Admin registered domain in Neon DB: "${cleanDomain}" (${type})`,
      });

      const r = rows[0];
      return res.json({
        id: r.id,
        domain: r.domain,
        source: r.source || "manual",
        domainType: r.domain_type,
        domain_type: r.domain_type,
        status: r.status,
        isVerified: Boolean(r.is_verified),
        requestCount: Number(r.request_count) || 0,
        lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toLocaleString() : "",
        createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/domains/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, domainType, isVerified } = req.body;

      const { rows } = await pool.query(
        `UPDATE neon_domains
         SET status = COALESCE($1, status),
             domain_type = COALESCE($2, domain_type),
             is_verified = COALESCE($3, is_verified),
             last_active_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [status ?? null, domainType ?? null, isVerified ?? null, id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Domain not found." });
      }

      const r = rows[0];
      return res.json({
        id: r.id,
        domain: r.domain,
        source: r.source,
        domainType: r.domain_type,
        domain_type: r.domain_type,
        status: r.status,
        isVerified: Boolean(r.is_verified),
        requestCount: Number(r.request_count) || 0,
        lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toLocaleString() : "",
        createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/domains/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM neon_domains WHERE id = $1", [id]);
      await insertNeonLog({
        level: "warn",
        message: `Admin removed domain ID (${id}) from Neon DB`,
      });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SETTINGS ENDPOINTS (NEON POSTGRES)
  // ==========================================
  app.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) {
        return res.json({
          siteName: "R Sender",
          siteLogo: "",
          favicon: "✉️",
          supportEmail: "support@rsender.io",
          neonConnectionString: "",
          neonStatus: "disconnected",
          defaultDelayMs: 3000,
          defaultSenderEmail: "sender@yourdomain.com",
          defaultSenderName: "R Sender Dispatcher",
          retryFailedCount: 2,
          maintenanceMode: false,
          companyName: "Your Company",
          companyAddress: "123 Business Rd, City, Country",
          defaultUnsubscribeUrl: "https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}",
          enableOneClickUnsubscribe: true,
          enableGlobalUnsubscribe: true,
          enableResendTracking: false,
          enableAutoReplyTo: true,
          defaultSubject: "Update regarding your account {name}",
          enableDynamicTags: true,
          enableDeliverabilityScanner: true,
          enableAttachments: true,
          enablePlainTextFallback: true,
        });
      }
      const { rows } = await pool.query("SELECT * FROM neon_settings LIMIT 1");
      if (rows.length === 0) {
        return res.json({
          siteName: "R Sender",
          siteLogo: "",
          favicon: "✉️",
          supportEmail: "support@rsender.io",
          neonConnectionString: DATABASE_URL,
          neonStatus: "connected",
          defaultDelayMs: 3000,
          defaultSenderEmail: "sender@yourdomain.com",
          defaultSenderName: "R Sender Dispatcher",
          retryFailedCount: 2,
          maintenanceMode: false,
          companyName: "Your Company",
          companyAddress: "123 Business Rd, City, Country",
          defaultUnsubscribeUrl: "https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}",
          enableOneClickUnsubscribe: true,
          enableGlobalUnsubscribe: true,
          enableResendTracking: false,
          enableAutoReplyTo: true,
          defaultSubject: "Update regarding your account {name}",
          enableDynamicTags: true,
          enableDeliverabilityScanner: true,
          enableAttachments: true,
          enablePlainTextFallback: true,
        });
      }
      const r = rows[0];
      res.json({
        siteName: r.site_name,
        siteLogo: r.site_logo,
        favicon: r.favicon,
        supportEmail: r.support_email,
        neonConnectionString: r.neon_connection_string || DATABASE_URL,
        neonStatus: r.neon_status || "connected",
        defaultDelayMs: r.default_delay_ms,
        defaultSenderEmail: r.defaultSender_email,
        defaultSenderName: r.defaultSender_name,
        retryFailedCount: r.retry_failed_count,
        maintenanceMode: r.maintenance_mode,
        companyName: r.company_name || "Your Company",
        companyAddress: r.company_address || "123 Business Rd, City, Country",
        defaultUnsubscribeUrl: r.default_unsubscribe_url || "https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}",
        enableOneClickUnsubscribe: r.enable_one_click_unsubscribe !== false,
        enableGlobalUnsubscribe: r.enable_global_unsubscribe !== false,
        enableResendTracking: r.enable_resend_tracking === true,
        enableAutoReplyTo: r.enable_auto_reply_to !== false,
        defaultSubject: r.default_subject || "Update regarding your account {name}",
        enableDynamicTags: r.enable_dynamic_tags !== false,
        enableDeliverabilityScanner: r.enable_deliverability_scanner !== false,
        enableAttachments: r.enable_attachments !== false,
        enablePlainTextFallback: r.enable_plain_text_fallback !== false,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const {
        siteName,
        siteLogo,
        favicon,
        supportEmail,
        neonConnectionString,
        neonStatus,
        defaultDelayMs,
        defaultSenderEmail,
        defaultSenderName,
        maintenanceMode,
        companyName,
        companyAddress,
        defaultUnsubscribeUrl,
        enableOneClickUnsubscribe,
        enableGlobalUnsubscribe,
        enableResendTracking,
        enableAutoReplyTo,
        defaultSubject,
        enableDynamicTags,
        enableDeliverabilityScanner,
        enableAttachments,
        enablePlainTextFallback,
      } = req.body;

      await pool.query(
        `INSERT INTO neon_settings (
          id, site_name, site_logo, favicon, support_email, neon_connection_string,
          neon_status, default_delay_ms, defaultSender_email, defaultSender_name,
          maintenance_mode, company_name, company_address, default_unsubscribe_url,
          enable_one_click_unsubscribe, enable_global_unsubscribe, enable_resend_tracking,
          enable_auto_reply_to, default_subject, enable_dynamic_tags, enable_deliverability_scanner,
          enable_attachments, enable_plain_text_fallback, updated_at
        ) VALUES (
          'default_settings', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET site_name = COALESCE(EXCLUDED.site_name, neon_settings.site_name),
            site_logo = COALESCE(EXCLUDED.site_logo, neon_settings.site_logo),
            favicon = COALESCE(EXCLUDED.favicon, neon_settings.favicon),
            support_email = COALESCE(EXCLUDED.support_email, neon_settings.support_email),
            neon_connection_string = COALESCE(EXCLUDED.neon_connection_string, neon_settings.neon_connection_string),
            neon_status = COALESCE(EXCLUDED.neon_status, neon_settings.neon_status),
            default_delay_ms = COALESCE(EXCLUDED.default_delay_ms, neon_settings.default_delay_ms),
            defaultSender_email = COALESCE(EXCLUDED.defaultSender_email, neon_settings.defaultSender_email),
            defaultSender_name = COALESCE(EXCLUDED.defaultSender_name, neon_settings.defaultSender_name),
            maintenance_mode = COALESCE(EXCLUDED.maintenance_mode, neon_settings.maintenance_mode),
            company_name = COALESCE(EXCLUDED.company_name, neon_settings.company_name),
            company_address = COALESCE(EXCLUDED.company_address, neon_settings.company_address),
            default_unsubscribe_url = COALESCE(EXCLUDED.default_unsubscribe_url, neon_settings.default_unsubscribe_url),
            enable_one_click_unsubscribe = COALESCE(EXCLUDED.enable_one_click_unsubscribe, neon_settings.enable_one_click_unsubscribe),
            enable_global_unsubscribe = COALESCE(EXCLUDED.enable_global_unsubscribe, neon_settings.enable_global_unsubscribe),
            enable_resend_tracking = COALESCE(EXCLUDED.enable_resend_tracking, neon_settings.enable_resend_tracking),
            enable_auto_reply_to = COALESCE(EXCLUDED.enable_auto_reply_to, neon_settings.enable_auto_reply_to),
            default_subject = COALESCE(EXCLUDED.default_subject, neon_settings.default_subject),
            enable_dynamic_tags = COALESCE(EXCLUDED.enable_dynamic_tags, neon_settings.enable_dynamic_tags),
            enable_deliverability_scanner = COALESCE(EXCLUDED.enable_deliverability_scanner, neon_settings.enable_deliverability_scanner),
            enable_attachments = COALESCE(EXCLUDED.enable_attachments, neon_settings.enable_attachments),
            enable_plain_text_fallback = COALESCE(EXCLUDED.enable_plain_text_fallback, neon_settings.enable_plain_text_fallback),
            updated_at = NOW()`,
        [
          siteName ?? "R Sender",
          siteLogo ?? "",
          favicon ?? "✉️",
          supportEmail ?? "support@rsender.io",
          neonConnectionString || DATABASE_URL,
          neonStatus ?? "connected",
          defaultDelayMs ?? 3000,
          defaultSenderEmail ?? "sender@yourdomain.com",
          defaultSenderName ?? "R Sender Dispatcher",
          maintenanceMode ?? false,
          companyName ?? "Your Company",
          companyAddress ?? "123 Business Rd, City, Country",
          defaultUnsubscribeUrl ?? "https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}",
          enableOneClickUnsubscribe !== undefined ? enableOneClickUnsubscribe : true,
          enableGlobalUnsubscribe !== undefined ? enableGlobalUnsubscribe : true,
          enableResendTracking !== undefined ? enableResendTracking : false,
          enableAutoReplyTo !== undefined ? enableAutoReplyTo : true,
          defaultSubject ?? "Update regarding your account {name}",
          enableDynamicTags !== undefined ? enableDynamicTags : true,
          enableDeliverabilityScanner !== undefined ? enableDeliverabilityScanner : true,
          enableAttachments !== undefined ? enableAttachments : true,
          enablePlainTextFallback !== undefined ? enablePlainTextFallback : true,
        ],
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // LOGS ENDPOINTS (NEON POSTGRES)
  // ==========================================
  app.get("/api/logs", async (_req: Request, res: Response) => {
    try {
      if (!hasRealDatabaseUrl) return res.json({ logs: [] });
      const { rows } = await pool.query(
        "SELECT * FROM neon_logs ORDER BY created_at DESC LIMIT 250",
      );
      const formatted = rows.map((r) => ({
        id: r.id,
        userId: r.user_id || undefined,
        timestamp: r.timestamp,
        level: r.level,
        taskId: r.task_id,
        taskName: r.task_name,
        apiName: r.api_name,
        recipient: r.recipient,
        message: r.message,
        details: r.details,
      }));
      res.json({ logs: formatted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs", async (req: Request, res: Response) => {
    try {
      await insertNeonLog(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/logs", async (_req: Request, res: Response) => {
    try {
      await pool.query("DELETE FROM neon_logs");
      res.json({ success: true, message: "Neon logs purged" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SUPABASE S3 STORAGE ENDPOINTS
  // ==========================================
  app.get("/api/storage/config", async (_req: Request, res: Response) => {
    try {
      const config = await getStorageConfig();
      // Mask secret access key for security
      const maskedSecret = config.secretAccessKey
        ? "••••••••••••" + config.secretAccessKey.slice(-4)
        : "";
      res.json({
        ...config,
        secretAccessKey: maskedSecret,
        hasSecret: !!config.secretAccessKey,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/storage/config", async (req: Request, res: Response) => {
    try {
      const updated = await saveStorageConfig(req.body);
      await insertNeonLog({
        level: "info",
        message: `Admin updated Supabase S3 storage configuration (Bucket: "${updated.bucket || "not set"}")`,
      });
      const maskedSecret = updated.secretAccessKey
        ? "••••••••••••" + updated.secretAccessKey.slice(-4)
        : "";
      res.json({
        ...updated,
        secretAccessKey: maskedSecret,
        hasSecret: !!updated.secretAccessKey,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/storage/test", async (req: Request, res: Response) => {
    try {
      const result = await testStorageConnection(req.body);
      if (result.connected) {
        await insertNeonLog({
          level: "success",
          message: `Supabase S3 storage health check passed: Bucket "${result.bucket}" (${result.pingMs}ms)`,
        });
        res.json(result);
      } else {
        await insertNeonLog({
          level: "warn",
          message: `Supabase S3 storage test failed: ${result.message}`,
        });
        res.status(400).json(result);
      }
    } catch (err: any) {
      res.status(500).json({ connected: false, message: err.message });
    }
  });

  // Universal User Upload Endpoint (attachments, images, recipient lists, etc.)
  app.post("/api/storage/upload", async (req: Request, res: Response) => {
    try {
      const { fileName, base64Content, mimeType, source, uploadedBy } =
        req.body;

      if (!fileName || !base64Content) {
        return res
          .status(400)
          .json({ error: "fileName and base64Content are required." });
      }

      // Strip data URI header if present
      let rawBase64 = base64Content;
      if (rawBase64.includes("base64,")) {
        rawBase64 = rawBase64.split("base64,")[1];
      }

      const buffer = Buffer.from(rawBase64, "base64");

      // Maximum 25MB limit per file
      if (buffer.length > 25 * 1024 * 1024) {
        return res
          .status(400)
          .json({ error: "File size exceeds maximum allowed 25MB." });
      }

      const uploadResult = await uploadFileToSupabase({
        buffer,
        fileName,
        mimeType: mimeType || "application/octet-stream",
        source: source || "attachment",
        uploadedBy: uploadedBy || "system",
      });

      await insertNeonLog({
        level: "success",
        message: `Saved file "${fileName}" to Supabase S3 (${Math.round(buffer.length / 1024)} KB, ${source || "attachment"})`,
      });

      res.json({
        success: true,
        file: uploadResult,
      });
    } catch (err: any) {
      console.error("[Storage Upload Error]", err);
      res.status(500).json({
        success: false,
        error: err.message || "Failed to upload file to Supabase S3 storage",
      });
    }
  });

  app.get("/api/storage/files", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 100;
      const files = await getUploadedFiles(limit);
      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/storage/files/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await deleteUploadedFile(id);
      if (deleted) {
        await insertNeonLog({
          level: "warn",
          message: `Removed file (${id}) from Supabase S3 and database`,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy endpoint to bypass CORS when fetching attachments from S3
  app.get("/api/storage/proxy", async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: "URL is required" });
      }

      const fetchRes = await fetch(targetUrl);
      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({ error: `Failed to fetch from S3: ${fetchRes.statusText}` });
      }

      const arrayBuffer = await fetchRes.arrayBuffer();
      const contentType = fetchRes.headers.get("content-type") || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // RESEND API TESTING & REAL DISPATCH
  // ==========================================
  app.post("/api/resend/test", async (req: Request, res: Response) => {
    try {
      const { apiKey, fromEmail } = req.body;

      if (!apiKey || typeof apiKey !== "string") {
        return res.status(400).json({
          valid: false,
          error: "Resend API key is required (starts with re_...)",
        });
      }

      const trimmedKey = apiKey.trim();
      if (!trimmedKey.startsWith("re_")) {
        return res.status(400).json({
          valid: false,
          error: 'Invalid key format. Resend API keys always begin with "re_"',
        });
      }

      // 1. First, check if this is a Full-Access key by querying /domains
      try {
        const domainRes = await fetch("https://api.resend.com/domains", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            "Content-Type": "application/json",
          },
        });

        const domainData = await domainRes.json().catch(() => ({}));

        if (domainRes.ok) {
          const domainsList: any[] = Array.isArray(domainData?.data)
            ? domainData.data
            : [];
          const verifiedDomains = domainsList
            .filter((d: any) => d.status === "verified")
            .map((d: any) => d.name);

          const defaultSender =
            verifiedDomains.length > 0
              ? `mail@${verifiedDomains[0]}`
              : (fromEmail && !fromEmail.includes("resend.dev") ? fromEmail : "");

          await insertNeonLog({
            level: "success",
            message: `Resend Full-Access Key verified (${trimmedKey.substring(0, 8)}...). ${verifiedDomains.length} verified domain(s) detected.`,
            details: { verifiedDomains, totalDomains: domainsList.length },
          });

          return res.json({
            valid: true,
            status: "active",
            accessType: "full",
            domains: domainsList.map((d: any) => ({
              name: d.name,
              status: d.status,
            })),
            verifiedDomains,
            defaultSender,
            message: `Connected to Resend! Key verified (${verifiedDomains.length > 0 ? `${verifiedDomains.length} verified domain(s) detected` : "Remember to configure your verified domain sender address"})`,
          });
        }

        // 2. If /domains returned 403 / restricted, check if it is a Sending-Access key
        const isRestricted =
          domainRes.status === 403 ||
          domainData?.name === "restricted_apiKey" ||
          (domainData?.message &&
            domainData.message.toLowerCase().includes("access"));

        if (
          isRestricted ||
          domainRes.status === 401 ||
          domainRes.status === 400
        ) {
          // Probe POST /emails with empty body to verify if sending access is authentic
          const probeRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${trimmedKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });

          const probeData = await probeRes.json().catch(() => ({}));

          // If Resend returns 422 validation_error, authentication succeeded! The key is valid for sending.
          if (
            probeRes.status === 422 ||
            (probeData?.name === "validation_error" &&
              probeRes.status !== 401 &&
              probeRes.status !== 400)
          ) {
            await insertNeonLog({
              level: "success",
              message: `Resend Sending-Access Key verified (${trimmedKey.substring(0, 8)}...). Ready for live dispatch.`,
            });

            return res.json({
              valid: true,
              status: "activeSending_only",
              accessType: "sending_only",
              domains: [],
              verifiedDomains: [],
              defaultSender: fromEmail && !fromEmail.includes("resend.dev") ? fromEmail : "",
              message:
                "Connected to Resend! Valid Sending-Access Key ready for email dispatch.",
            });
          }

          // If probe returned 401 or 400 invalid API key
          const errMsg =
            probeData?.message ||
            domainData?.message ||
            "Invalid Resend API Key. Please verify at resend.com/api-keys";
          return res.status(400).json({
            valid: false,
            error: errMsg,
            details: probeData,
          });
        }

        return res.status(400).json({
          valid: false,
          error:
            domainData?.message || "Resend rejected API key authentication",
          details: domainData,
        });
      } catch (networkErr: any) {
        return res.status(500).json({
          valid: false,
          error: `Network error reaching api.resend.com: ${networkErr.message}`,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        valid: false,
        error: err.message || "Internal server error while testing key",
      });
    }
  });

  // Fetch verified domains from Resend for an API key
  app.post("/api/resend/domains", async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) return res.status(400).json({ error: "API key required" });

      const domainRes = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${String(apiKey).trim()}` },
      });
      const data = await domainRes.json().catch(() => ({}));

      if (!domainRes.ok) {
        return res.json({
          success: false,
          domains: [],
          message: data.message || "Sending-only key or no domains",
        });
      }

      const list = Array.isArray(data?.data) ? data.data : [];
      return res.json({
        success: true,
        domains: list.map((d: any) => ({ name: d.name, status: d.status })),
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Unified Multi-Provider Email Dispatch (Resend API & Custom SMTP with RFC 8058 & Anti-Spam Compliance)
  app.post(["/api/resend/send", "/api/send"], async (req: Request, res: Response) => {
    try {
      const {
        apiKey,
        key,
        from,
        to,
        subject,
        html,
        text,
        attachments,
        headers,
        replyTo,
        reply_to,
        autoReplyTo,
        unsubscribeUrl,
        enableOneClickUnsubscribe,
        taskId,
        taskName,
        apiName,
        apiId,
        providerType,
        provider_type,
        smtpHost,
        smtp_host,
        smtpPort,
        smtp_port,
        smtpSecure,
        smtp_secure,
        smtpUser,
        smtp_user,
        smtpPass,
        smtp_pass,
        open_tracking,
        openTracking,
        click_tracking,
        clickTracking,
        track_opens,
        trackOpens,
        track_clicks,
        trackClicks,
      } = req.body;

      if (!to || !subject) {
        return res.status(400).json({
          success: false,
          error: "Missing required recipient or subject",
        });
      }

      // Recipient normalization
      const recipientList: string[] = Array.isArray(to)
        ? to.map((t: any) => String(t).trim()).filter(Boolean)
        : [String(to).trim()];

      if (recipientList.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No valid recipient email provided" });
      }
      const recipientSummary = recipientList.join(", ");

      // Sender Email formatting, sanitization & DMARC Guard
      let formattedFrom = from && typeof from === "string" ? from.trim() : "";
      if (!formattedFrom) {
        return res.status(400).json({
          success: false,
          error: "DMARC Guard: Sender email ('from') is required. Cannot dispatch without a verified domain sender address.",
        });
      }

      // Clean format e.g. "Name <email@domain.com>" or "email@domain.com"
      const fromMatch = formattedFrom.match(
        /^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/,
      );
      if (fromMatch) {
        const cleanName = fromMatch[1].replace(/[<>"]/g, "").trim();
        const cleanEmail = fromMatch[2].trim().toLowerCase();
        if (cleanEmail === "onboarding@resend.dev") {
          return res.status(400).json({
            success: false,
            error: "DMARC Guard: 'onboarding@resend.dev' is not permitted for live campaign dispatches to prevent DMARC alignment failure. Please use an authenticated sender address on your verified domain.",
          });
        }
        let finalName = cleanName;
        if (cleanName) {
          const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(cleanName);
          finalName = needsQuoting ? `"${cleanName}"` : cleanName;
        }
        formattedFrom = finalName ? `${finalName} <${cleanEmail}>` : cleanEmail;
      } else {
        const cleanEmail = formattedFrom.replace(/[<>"]/g, "").trim().toLowerCase();
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
          return res.status(400).json({
            success: false,
            error: `Invalid sender email format: "${formattedFrom}". A valid authenticated email address is required.`,
          });
        }
        if (cleanEmail === "onboarding@resend.dev") {
          return res.status(400).json({
            success: false,
            error: "DMARC Guard: 'onboarding@resend.dev' is not permitted for live campaign dispatches to prevent DMARC alignment failure. Please use an authenticated sender address on your verified domain.",
          });
        }
        formattedFrom = cleanEmail;
      }

      // Resolve channel details (from DB if apiId provided, or direct parameters)
      let resolvedChannel: EmailChannel = {
        id: apiId || "manual_channel",
        name: apiName || "Sender Channel",
        provider_type: providerType || provider_type || (smtpHost || smtp_host ? "smtp" : "resend"),
        key: (apiKey || key || "").trim(),
        sender_email: formattedFrom,
        smtp_host: smtpHost || smtp_host,
        smtp_port: smtpPort !== undefined ? Number(smtpPort) : (smtp_port !== undefined ? Number(smtp_port) : undefined),
        smtp_secure: smtpSecure !== undefined ? Boolean(smtpSecure) : (smtp_secure !== undefined ? Boolean(smtp_secure) : undefined),
        smtp_user: smtpUser || smtp_user,
        smtp_pass: smtpPass !== undefined ? smtpPass : smtp_pass,
      };

      if (apiId && !resolvedChannel.smtp_host && !resolvedChannel.key) {
        if (hasRealDatabaseUrl) {
          const { rows: dbRows } = await pool.query(
            "SELECT * FROM neon_apis WHERE id = $1 LIMIT 1",
            [apiId],
          );
          if (dbRows.length > 0) {
            const r = dbRows[0];
            resolvedChannel = {
              id: r.id,
              name: r.name,
              provider_type: r.provider_type || "resend",
              key: r.key || "",
              sender_email: r.sender_email || formattedFrom,
              smtp_host: r.smtp_host || "",
              smtp_port: Number(r.smtp_port) || 587,
              smtp_secure: Boolean(r.smtp_secure),
              smtp_user: r.smtp_user || "",
              smtp_pass: r.smtp_pass || "",
            };
          }
        } else {
          const mem = inMemoryApis.find((a) => a.id === apiId);
          if (mem) {
            resolvedChannel = {
              id: mem.id,
              name: mem.name,
              provider_type: mem.providerType || mem.provider_type || "resend",
              key: mem.key || "",
              sender_email: mem.senderEmail || formattedFrom,
              smtp_host: mem.smtpHost || mem.smtp_host || "",
              smtp_port: Number(mem.smtpPort || mem.smtp_port) || 587,
              smtp_secure: Boolean(mem.smtpSecure || mem.smtp_secure),
              smtp_user: mem.smtpUser || mem.smtp_user || "",
              smtp_pass: mem.smtpPass || mem.smtp_pass || "",
            };
          }
        }
      }

      // Provider credentials validation
      if (resolvedChannel.provider_type === "smtp") {
        if (!resolvedChannel.smtp_host || !resolvedChannel.smtp_user) {
          return res.status(400).json({
            success: false,
            error: "SMTP host and username are required for SMTP dispatch.",
          });
        }
      } else {
        if (!resolvedChannel.key) {
          return res.status(400).json({
            success: false,
            error: "Resend API key missing or invalid.",
          });
        }
      }

      // Build strictly compliant email payload
      const emailPayload: any = {
        from: formattedFrom,
        to: recipientList[0],
        subject: String(subject).trim() || "Notification",
      };

      // 1. Reply-To Sanitization, Auto-Domain Alignment, and Injection Defense
      const rawReplyTo = replyTo || reply_to;
      const isAutoReplyTo = autoReplyTo !== false;

      // 2. Dual-Part MIME Auto-Converter (RFC 2046 Alternative) & Body Hardening
      if (html && typeof html === "string" && html.trim().length > 0) {
        emailPayload.html = html;
      }
      if (text && typeof text === "string" && text.trim().length > 0) {
        emailPayload.text = text;
      } else if (emailPayload.html) {
        emailPayload.text = htmlToPlainText(emailPayload.html);
      }

      if (!emailPayload.html && !emailPayload.text) {
        return res.status(400).json({
          success: false,
          error: "Email body is required. Both HTML and Plain-Text content are missing.",
        });
      }

      // 3. RFC-8058 One-Click List-Unsubscribe Header Generation & Reply-To Resolution
      const requestOrigin = req.protocol && req.get("host")
        ? `${req.protocol}://${req.get("host")}`
        : undefined;

      let allowTracking = false;
      let defaultUnsubUrl: string | undefined;
      let enableGlobalUnsub = true;

      if (hasRealDatabaseUrl) {
        try {
          const { rows: stRows } = await pool.query(
            "SELECT enable_resend_tracking, default_unsubscribe_url, enable_global_unsubscribe FROM neon_settings LIMIT 1"
          );
          if (stRows.length > 0) {
            allowTracking = stRows[0].enable_resend_tracking === true;
            defaultUnsubUrl = stRows[0].default_unsubscribe_url;
            enableGlobalUnsub = stRows[0].enable_global_unsubscribe !== false;
          }
        } catch {}
      }

      const antiSpam = generateAntiSpamHeaders({
        fromEmail: formattedFrom,
        recipientEmail: recipientList[0],
        replyTo: rawReplyTo,
        autoReplyTo: isAutoReplyTo,
        unsubscribeUrl: typeof unsubscribeUrl === "string" ? unsubscribeUrl : undefined,
        defaultUnsubscribeUrl: defaultUnsubUrl,
        enableGlobalUnsubscribe: enableGlobalUnsub,
        enableOneClickUnsubscribe: enableOneClickUnsubscribe !== false,
        customHeaders: headers && typeof headers === "object" ? headers : {},
        origin: requestOrigin,
      });

      if (antiSpam.replyTo) {
        emailPayload.reply_to = antiSpam.replyTo;
      }

      if (antiSpam.headers && Object.keys(antiSpam.headers).length > 0) {
        emailPayload.headers = antiSpam.headers;
      }

      // Tracking flags: only enable if both Admin Master Switch is ON and caller requested tracking
      const isRequestedOpenTracking = Boolean(open_tracking ?? openTracking ?? track_opens ?? trackOpens);
      const isRequestedClickTracking = Boolean(click_tracking ?? clickTracking ?? track_clicks ?? trackClicks);
      emailPayload.open_tracking = allowTracking && isRequestedOpenTracking;
      emailPayload.click_tracking = allowTracking && isRequestedClickTracking;

      // 4. Attachments
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailPayload.attachments = attachments.map((att: any) => ({
          filename: att.filename || att.name || "attachment",
          content: att.content || att.base64Content,
        }));
      }

      // LIVE CALL VIA UNIFIED PROVIDER ENGINE
      const sendResult = await sendEmailUnified(resolvedChannel, emailPayload);

      if (sendResult.success) {
        await insertNeonLog({
          level: "success",
          taskId,
          taskName,
          apiName: resolvedChannel.name,
          recipient: recipientSummary,
          message: `Delivered to ${recipientSummary} [${sendResult.provider.toUpperCase()} ID: ${sendResult.messageId}]${emailPayload.reply_to ? ` [Reply-To: ${emailPayload.reply_to}]` : ""}`,
          details: {
            id: sendResult.messageId,
            provider: sendResult.provider,
            from: formattedFrom,
            replyTo: emailPayload.reply_to,
            hasUnsubscribeHeader: !!emailPayload.headers?.["List-Unsubscribe"],
          },
        });

        return res.json({
          success: true,
          id: sendResult.messageId,
          provider: sendResult.provider,
          from: formattedFrom,
          to: recipientList,
          replyTo: emailPayload.reply_to,
          message: `Delivered successfully via ${sendResult.provider.toUpperCase()} (ID: ${sendResult.messageId})`,
        });
      } else {
        const errorMsg = sendResult.error || "Email delivery failed";
        await insertNeonLog({
          level: "error",
          taskId,
          taskName,
          apiName: resolvedChannel.name,
          recipient: recipientSummary,
          message: `Delivery failed to ${recipientSummary} via ${sendResult.provider.toUpperCase()}: ${errorMsg}`,
          details: sendResult.details,
        });

        return res.status(400).json({
          success: false,
          error: errorMsg,
          code: sendResult.code || "delivery_failed",
          provider: sendResult.provider,
          details: sendResult.details,
        });
      }
    } catch (err: any) {
      await insertNeonLog({
        level: "error",
        message: `Internal exception while sending email: ${err.message}`,
      });
      return res.status(500).json({
        success: false,
        error: err.message || "Server failed to dispatch email",
      });
    }
  });

  // Serve Frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(path.resolve(__dirname, "dist"), {
        maxAge: "7d",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          } else {
            res.setHeader("Cache-Control", "public, max-age=604800, immutable");
          }
        },
      })
    );
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[R Sender] Full-stack engine running on http://0.0.0.0:${PORT}`,
    );
    console.log(
      `[R Sender] Neon Postgres status: ${dbConnected ? "CONNECTED" : "FAILED: " + dbError}`,
    );
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});



