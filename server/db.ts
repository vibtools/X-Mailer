import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

export function resolveDatabaseUrl(): string {
  const value = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
  if (!value) {
    console.warn(
      "[Neon DB] WARNING: DATABASE_URL environment variable is not defined.",
    );
  }
  return sanitizeConnectionString(value);
}

// Single standardized DATABASE_URL (NEON_DATABASE_URL retained as backwards-compatible alias)
export const DATABASE_URL = resolveDatabaseUrl();
export const NEON_DATABASE_URL = DATABASE_URL;

// Clean connection string helper to ensure SSL & driver compatibility
export function sanitizeConnectionString(raw?: string): string {
  if (!raw) return "";
  let clean = raw.trim();
  if (clean.includes("channel_binding=")) {
    clean = clean.replace(/[?&]channel_binding=[^&]+/, "");
  }
  return clean;
}

export function isPlaceholderUrl(raw?: string): boolean {
  if (!raw) return true;
  return (
    raw.includes("your-project.neon.tech") ||
    raw.includes("user:password@") ||
    raw.includes("placeholder")
  );
}

export const cleanConnectionString = sanitizeConnectionString(DATABASE_URL);
export const hasRealDatabaseUrl =
  Boolean(cleanConnectionString) && !isPlaceholderUrl(cleanConnectionString);

// Helper to extract database host from connection string dynamically
export function extractDbHost(connStr?: string): string {
  const target = connStr || cleanConnectionString;
  if (!target) return "No Database Configured";
  try {
    const url = new URL(target);
    return url.hostname;
  } catch {
    const match = target.match(/@([^/:?]+)/);
    return match ? match[1] : "neon-postgres-cluster";
  }
}

// Real PostgreSQL Pool connected strictly to DATABASE_URL from environment
export const pool = new Pool({
  connectionString: cleanConnectionString || undefined,
  ssl: cleanConnectionString
    ? {
        rejectUnauthorized: false,
      }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Guard against unhandled idle client errors to prevent process crashes
pool.on("error", (err) => {
  console.error("[Neon DB] Unexpected error on idle client:", err.message);
});

// Test helper to verify any target connection string or the default active pool
export async function testConnectionUri(uri?: string): Promise<{
  connected: boolean;
  message: string;
  database?: string;
  user?: string;
  endpoint?: string;
  pgVersion?: string;
  pingMs?: number;
}> {
  const target =
    uri && uri.trim()
      ? sanitizeConnectionString(uri.trim())
      : cleanConnectionString;
  if (!target) {
    return {
      connected: false,
      message:
        "No database connection string configured. Set DATABASE_URL in environment.",
    };
  }

  const startTime = Date.now();

  // If testing a custom connection string that differs from the active pool
  if (
    uri &&
    uri.trim() &&
    sanitizeConnectionString(uri.trim()) !== cleanConnectionString
  ) {
    const testPool = new Pool({
      connectionString: target,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    testPool.on("error", () => {});

    try {
      const client = await testPool.connect();
      try {
        const res = await client.query(
          "SELECT version(), current_database(), current_user, NOW() as current_time",
        );
        const pingMs = Date.now() - startTime;
        return {
          connected: true,
          message: `Connected successfully to Neon Postgres in ${pingMs}ms! (Database: ${res.rows[0].current_database})`,
          database: res.rows[0].current_database,
          user: res.rows[0].current_user,
          endpoint: extractDbHost(target),
          pgVersion: res.rows[0].version,
          pingMs,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      return {
        connected: false,
        message: `Connection failed: ${err.message}`,
        endpoint: extractDbHost(target),
      };
    } finally {
      await testPool.end().catch(() => {});
    }
  }

  // Testing the active database pool
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(
        "SELECT version(), current_database(), current_user, NOW() as current_time",
      );
      const pingMs = Date.now() - startTime;
      return {
        connected: true,
        message: `Active Neon Postgres connection is healthy (${pingMs}ms)! (Database: ${res.rows[0].current_database})`,
        database: res.rows[0].current_database,
        user: res.rows[0].current_user,
        endpoint: extractDbHost(cleanConnectionString),
        pgVersion: res.rows[0].version,
        pingMs,
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    return {
      connected: false,
      message: `Database ping error: ${err.message}`,
      endpoint: extractDbHost(cleanConnectionString),
    };
  }
}

export async function initDatabase() {
  if (!hasRealDatabaseUrl) {
    console.warn(
      "[Neon DB] No real DATABASE_URL found in environment (missing or placeholder). Database initialization skipped.",
    );
    return;
  }

  console.log("[Neon DB] Connecting to PostgreSQL database...");
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(
        "SELECT version(), current_database(), current_user;",
      );
      console.log(
        `[Neon DB] Connected successfully to PostgreSQL! Database: ${res.rows[0].current_database}, User: ${res.rows[0].current_user}, Host: ${extractDbHost()}`,
      );

      // Create Database Schema for R Sender
      await client.query(`
        CREATE TABLE IF NOT EXISTS neon_settings (
          id VARCHAR(50) PRIMARY KEY,
          site_name VARCHAR(255) DEFAULT 'R Sender',
          site_logo TEXT DEFAULT '',
          favicon VARCHAR(50) DEFAULT '✉️',
          support_email VARCHAR(255) DEFAULT 'support@rsender.io',
          neon_connection_string TEXT DEFAULT '',
          neon_status VARCHAR(50) DEFAULT 'connected',
          default_delay_ms INT DEFAULT 3000,
          default_sender_email VARCHAR(255) DEFAULT '',
          default_sender_name VARCHAR(255) DEFAULT 'R Sender Dispatcher',
          retry_failed_count INT DEFAULT 2,
          maintenance_mode BOOLEAN DEFAULT FALSE,
          company_name VARCHAR(255) DEFAULT 'Your Company',
          company_address TEXT DEFAULT '123 Business Rd, City, Country',
          default_unsubscribe_url TEXT DEFAULT 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}',
          enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE,
          enable_global_unsubscribe BOOLEAN DEFAULT TRUE,
          enable_resend_tracking BOOLEAN DEFAULT FALSE,
          enable_auto_reply_to BOOLEAN DEFAULT TRUE,
          default_subject VARCHAR(255) DEFAULT 'Update regarding your account {name}',
          enable_dynamic_tags BOOLEAN DEFAULT TRUE,
          enable_deliverability_scanner BOOLEAN DEFAULT TRUE,
          enable_attachments BOOLEAN DEFAULT TRUE,
          enable_plain_text_fallback BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_apis (
          id VARCHAR(100) PRIMARY KEY,
          user_id VARCHAR(100) DEFAULT '',
          name VARCHAR(255) NOT NULL,
          key TEXT NOT NULL,
          sender_email VARCHAR(255) NOT NULL,
          daily_limit INT DEFAULT 1000,
          used_today INT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          last_tested VARCHAR(100),
          test_status_msg TEXT,
          provider_type VARCHAR(50) DEFAULT 'resend',
          smtp_host VARCHAR(255),
          smtp_port INT DEFAULT 587,
          smtp_secure BOOLEAN DEFAULT FALSE,
          smtp_user VARCHAR(255),
          smtp_pass TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_users (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          status VARCHAR(50) DEFAULT 'active',
          daily_limit INT DEFAULT 5000,
          used_today INT DEFAULT 0,
          last_login VARCHAR(100) DEFAULT 'Never',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_content (
          id VARCHAR(50) PRIMARY KEY,
          sender_names JSONB DEFAULT '["Support Team"]'::jsonb,
          subjects JSONB DEFAULT '["Update regarding your account {name}", "Important notification for {company}"]'::jsonb,
          body_html TEXT,
          body_text TEXT,
          attachments JSONB DEFAULT '[]'::jsonb,
          track_opens BOOLEAN DEFAULT FALSE,
          track_clicks BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_presets (
          id VARCHAR(100) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          sender VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          html TEXT,
          text TEXT,
          created_by VARCHAR(100) DEFAULT 'system',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_tasks (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'idle',
          api_ids JSONB DEFAULT '[]'::jsonb,
          recipients JSONB DEFAULT '[]'::jsonb,
          stats JSONB DEFAULT '{"total":0,"success":0,"failed":0,"remaining":0}'::jsonb,
          current_log TEXT DEFAULT '',
          progress INT DEFAULT 0,
          delay_ms INT DEFAULT 800,
          sender_name VARCHAR(255),
          subject TEXT,
          body_html TEXT,
          body_text TEXT,
          attachments_count INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at VARCHAR(100),
          completed_at VARCHAR(100)
        );

        CREATE TABLE IF NOT EXISTS neon_logs (
          id VARCHAR(100) PRIMARY KEY,
          timestamp VARCHAR(50) NOT NULL,
          level VARCHAR(20) DEFAULT 'info',
          task_id VARCHAR(100),
          task_name VARCHAR(255),
          api_name VARCHAR(255),
          recipient VARCHAR(255),
          message TEXT NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS neon_domains (
          id VARCHAR(100) PRIMARY KEY,
          domain VARCHAR(255) UNIQUE NOT NULL,
          source VARCHAR(50) DEFAULT 'auto',
          domain_type VARCHAR(50) DEFAULT 'custom',
          status VARCHAR(50) DEFAULT 'active',
          is_verified BOOLEAN DEFAULT TRUE,
          request_count INT DEFAULT 0,
          last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure legacy columns exist for user-owned API keys, tasks, logs, and password records
      await client.query(
        `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`,
      );
      await client.query(
        `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS allowed_domains JSONB DEFAULT '[]'::jsonb;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) DEFAULT '';`,
      );
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS provider_type VARCHAR(50) DEFAULT 'resend';`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_port INT DEFAULT 587;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT FALSE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_pass TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) DEFAULT '';`,
      );
      await client.query(
        `ALTER TABLE neon_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) DEFAULT '';`,
      );
      // Phase 2 Anti-Spam & Deliverability schema migrations
      await client.query(
        `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS reply_to TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS auto_reply_to BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});

      await client.query(
        `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS reply_to TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS auto_reply_to BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});

      await client.query(
        `ALTER TABLE neon_settings ALTER COLUMN favicon TYPE TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ALTER COLUMN site_logo TYPE TEXT;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_content ALTER COLUMN track_opens SET DEFAULT FALSE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_content ALTER COLUMN track_clicks SET DEFAULT FALSE;`,
      ).catch(() => {});
      await client.query(
        `UPDATE neon_content SET track_opens = FALSE, track_clicks = FALSE WHERE track_opens = TRUE OR track_clicks = TRUE;`,
      ).catch(() => {});

      // Phase 7: CAN-SPAM Compliance settings
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'Your Company';`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS company_address TEXT DEFAULT '123 Business Rd, City, Country';`,
      ).catch(() => {});

      // Phase 1 Hardening: Content Settings & Global Deliverability Defaults
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS default_unsubscribe_url TEXT DEFAULT 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}';`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_global_unsubscribe BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_resend_tracking BOOLEAN DEFAULT FALSE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_auto_reply_to BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS default_subject VARCHAR(255) DEFAULT 'Update regarding your account {name}';`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_dynamic_tags BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_deliverability_scanner BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_attachments BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});
      await client.query(
        `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS enable_plain_text_fallback BOOLEAN DEFAULT TRUE;`,
      ).catch(() => {});

      // Initialize default settings if empty
      const checkSettings = await client.query(
        "SELECT COUNT(*) FROM neon_settings",
      );
      if (parseInt(checkSettings.rows[0].count, 10) === 0) {
        await client.query(`
          INSERT INTO neon_settings (
            id, site_name, site_logo, favicon, support_email, neon_connection_string,
            neon_status, default_delay_ms, default_sender_email, default_sender_name,
            company_name, company_address, default_unsubscribe_url, enable_one_click_unsubscribe,
            enable_global_unsubscribe, enable_resend_tracking, enable_auto_reply_to, default_subject,
            enable_dynamic_tags, enable_deliverability_scanner, enable_attachments, enable_plain_text_fallback
          ) VALUES (
            'default_settings', 'R Sender', '', '✉️', 'support@rsender.io',
            '', 'connected', 3000, '', 'R Sender Dispatcher',
            'Your Company', '123 Business Rd, City, Country',
            'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}', TRUE,
            TRUE, FALSE, TRUE, 'Update regarding your account {name}',
            TRUE, TRUE, TRUE, TRUE
          )
        `);
      }

      // Initialize default content template if empty
      const checkContent = await client.query(
        "SELECT COUNT(*) FROM neon_content",
      );
      if (parseInt(checkContent.rows[0].count, 10) === 0) {
        const defaultHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
  <h2 style="color: #0f172a; margin-top: 0;">Hello {name}! 👋</h2>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">
    Thank you for connecting with us at <strong>{company}</strong>. We are pleased to announce that our bulk email dispatch engine is now active.
  </p>
  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; color: #334155;">
      💡 <strong>Note:</strong> Automated round-robin key rotation ensures reliable email delivery without hitting provider rate limits.
    </p>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">
    If you have any questions or need custom dedicated IP pools, please reach out to us.
  </p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #94a3b8; text-align: center;">
    Sent by <strong>{sender_company}</strong> · {company_address}
  </p>
</div>`;

        const defaultText = `Hello {name},\n\nThank you for connecting with us at {company}. Our bulk email dispatch engine is now active.\n\nAutomated round-robin key rotation ensures reliable email delivery.\n\nBest regards,\nThe R Sender Team`;

        await client.query(
          `
          INSERT INTO neon_content (id, sender_names, subjects, body_html, body_text, attachments) VALUES
          ('default_content', $1, $2, $3, $4, '[]'::jsonb)
        `,
          [
            JSON.stringify(["R Sender Support", "Dispatch Team"]),
            JSON.stringify([
              "Quick update regarding your account {name}",
              "Important notification for {company}",
            ]),
            defaultHtml,
            defaultText,
          ],
        );
      }

      // Initialize / Sync default presets (Clean Spam-Free Invoice Presets)
      const invoiceStandardHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 18px; font-weight: 600;">Service Statement</h2>
    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Reference: {order_ref} · {date}</p>
  </div>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
    Hello {first_name},
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
    Here is the billing statement for services provided to <strong>{company}</strong> for the current period.
  </p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Account:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Statement Ref:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Issue Date:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Status:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #16a34a;">Processed</td>
      </tr>
    </table>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">
    If you have any questions regarding this statement, please feel free to reply directly to this email.
  </p>
  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>
  </div>
</div>`;
      const invoiceStandardText = `Hello {first_name},\n\nHere is the billing statement for services provided to {company} for the current period.\n\nAccount: {company}\nStatement Ref: {order_ref}\nIssue Date: {date}\nStatus: Processed\n\nIf you have any questions regarding this statement, please feel free to reply directly to this email.\n\nSent by {sender_company} · {company_address}`;

      const invoiceReceiptHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; background-color: #eef2ff; padding: 3px 8px; border-radius: 4px;">Payment Receipt</span>
    <h2 style="color: #0f172a; margin: 10px 0 0 0; font-size: 18px; font-weight: 600;">Subscription Confirmed</h2>
  </div>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
    Hi {first_name},
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
    Thank you for your continued partnership. This email confirms that your subscription for <strong>{company}</strong> has been successfully renewed.
  </p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
    <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Receipt Summary</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
      <tr>
        <td style="padding: 5px 0; color: #64748b;">Receipt Number:</td>
        <td style="padding: 5px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; color: #64748b;">Client:</td>
        <td style="padding: 5px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; color: #64748b;">Date:</td>
        <td style="padding: 5px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; color: #64748b;">Reference ID:</td>
        <td style="padding: 5px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{reference_id}</td>
      </tr>
    </table>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">
    Your service remains active without interruption. All past statements and invoices are accessible anytime.
  </p>
  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>
  </div>
</div>`;
      const invoiceReceiptText = `Hi {first_name},\n\nThank you for your continued partnership. This email confirms that your subscription for {company} has been successfully renewed.\n\nReceipt Number: {order_ref}\nClient: {company}\nDate: {date}\nReference ID: {reference_id}\n\nYour service remains active without interruption. All past statements and invoices are accessible anytime.\n\nSent by {sender_company} · {company_address}`;

      const invoiceDeliveryHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 18px; font-weight: 600;">Service Delivery Invoice</h2>
    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Milestone Ref: #{ticket_id} · {date}</p>
  </div>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
    Dear {first_name},
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
    The recent project milestone deliverables for <strong>{company}</strong> have been finalized. Please find the details for your records below:
  </p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Project / Account:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{company}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Milestone Code:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{ticket_id}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Order Ref:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; font-family: monospace; color: #0f172a;">{order_ref}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;">Billing Date:</td>
        <td style="padding: 6px 0; font-weight: 500; text-align: right; color: #0f172a;">{date}</td>
      </tr>
    </table>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 24px 0;">
    Thank you for choosing our services. Please reach out if you need itemized breakdown adjustments or tax documentation.
  </p>
  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
    <p style="margin: 0;">Sent by <strong>{sender_company}</strong> · {company_address}</p>
  </div>
</div>`;
      const invoiceDeliveryText = `Dear {first_name},\n\nThe recent project milestone deliverables for {company} have been finalized. Please find the details for your records below:\n\nProject / Account: {company}\nMilestone Code: #{ticket_id}\nOrder Ref: {order_ref}\nBilling Date: {date}\n\nThank you for choosing our services. Please reach out if you need itemized breakdown adjustments or tax documentation.\n\nSent by {sender_company} · {company_address}`;

      // Remove legacy sample presets if present
      await client.query(`
        DELETE FROM neon_presets WHERE id IN ('welcome', 'outreach', 'advisory');
      `).catch(() => {});

      // Upsert clean invoice presets
      await client.query(`
        INSERT INTO neon_presets (id, title, sender, subject, html, text, created_by) VALUES
        ('invoice_standard', 'Service Billing Statement', 'Billing Department', 'Statement for {company} — Ref {order_ref}', $1, $2, 'system'),
        ('invoice_receipt', 'Subscription Renewal Receipt', 'Accounts Team', 'Receipt for your subscription renewal — {order_ref}', $3, $4, 'system'),
        ('invoice_delivery', 'Service Delivery & Milestone Invoice', 'Finance Operations', 'Invoice for completed milestone #{ticket_id} — {company}', $5, $6, 'system')
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          sender = EXCLUDED.sender,
          subject = EXCLUDED.subject,
          html = EXCLUDED.html,
          text = EXCLUDED.text,
          updated_at = NOW();
      `, [invoiceStandardHtml, invoiceStandardText, invoiceReceiptHtml, invoiceReceiptText, invoiceDeliveryHtml, invoiceDeliveryText]);

      // Sync & Auto-register application domains (Cloudflare Pages, APP_DOMAIN, Custom Domain)
      await syncAppDomains(client);

      console.log(
        "[Neon DB] Tables and schema verified successfully on PostgreSQL.",
      );
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[Neon DB] Failed to connect to PostgreSQL: ${err.message}`);
  }
}

/**
 * Syncs and discovers application domains from environment variables and Cloudflare runtime.
 */
export async function syncAppDomains(dbClient?: any): Promise<void> {
  const runner = dbClient || pool;
  try {
    const rawDomainsToRegister: { domain: string; source: string; domainType: string }[] = [];

    // 1. Check APP_DOMAIN or CUSTOM_DOMAIN or DOMAIN from environment
    const appDomain = process.env.APP_DOMAIN || process.env.CUSTOM_DOMAIN || process.env.DOMAIN;
    if (appDomain && appDomain.trim()) {
      const clean = appDomain.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      if (clean) {
        rawDomainsToRegister.push({ domain: clean, source: 'env', domainType: 'primary' });
      }
    }

    // 2. Check Cloudflare Pages URL environment variable (e.g. CF_PAGES_URL or CLOUDFLARE_PAGES_URL)
    const cfPagesUrl = process.env.CF_PAGES_URL || process.env.CLOUDFLARE_PAGES_URL;
    if (cfPagesUrl && cfPagesUrl.trim()) {
      const clean = cfPagesUrl.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      if (clean) {
        rawDomainsToRegister.push({ domain: clean, source: 'cloudflare', domainType: 'cloudflare_pages' });
      }
    }

    // 3. Check VITE_APP_URL if defined
    const viteAppUrl = process.env.VITE_APP_URL;
    if (viteAppUrl && viteAppUrl.trim()) {
      const clean = viteAppUrl.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      if (clean && !rawDomainsToRegister.some(d => d.domain === clean)) {
        rawDomainsToRegister.push({
          domain: clean,
          source: 'env',
          domainType: clean.includes('pages.dev') ? 'cloudflare_pages' : 'custom',
        });
      }
    }

    // 4. Default fallback: localhost
    if (rawDomainsToRegister.length === 0) {
      rawDomainsToRegister.push({ domain: 'localhost', source: 'auto', domainType: 'local' });
    }

    for (const item of rawDomainsToRegister) {
      const id = `dom_${item.domain.replace(/[^a-z0-9]/gi, '_')}`;
      await runner.query(
        `INSERT INTO neon_domains (id, domain, source, domain_type, status, is_verified, request_count, last_active_at)
         VALUES ($1, $2, $3, $4, 'active', true, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (domain) DO UPDATE 
         SET last_active_at = CURRENT_TIMESTAMP`,
        [id, item.domain, item.source, item.domainType]
      ).catch(() => {});
    }
  } catch (err: any) {
    console.warn('[Neon DB] Domain sync warning:', err.message);
  }
}
