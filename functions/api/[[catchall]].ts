// Cloudflare Pages Function: Universal Edge API Router
// Runs on Cloudflare Pages Functions (Edge V8 Runtime with nodejs_compat)

import { neon, Pool } from "@neondatabase/serverless";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import { sendWithSmtp, verifySmtp } from "../../server/providers/smtp";
import { EmailChannel } from "../../server/providers/types";

interface Env {
  DATABASE_URL?: string;
  NEON_DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  JWT_SECRET?: string;
  AUTH_SECRET?: string;
  [key: string]: any;
}

interface EventContext {
  request: Request;
  env: Env;
  params: { catchall?: string[] };
  waitUntil: (promise: Promise<any>) => void;
  next: () => Promise<Response>;
}

// Helpers
function getDbUrl(env: Env): string {
  const raw =
    env.DATABASE_URL ||
    (typeof process !== "undefined" ? process.env.DATABASE_URL : "") ||
    env.NEON_DATABASE_URL ||
    (typeof process !== "undefined" ? process.env.NEON_DATABASE_URL : "") ||
    "";
  let clean = raw.trim();
  if (clean.includes("channel_binding=")) {
    clean = clean.replace(/[?&]channel_binding=[^&]+/, "");
  }
  return clean;
}

function extractDbHost(urlStr: string): string {
  if (!urlStr) return "Not Configured";
  try {
    return new URL(urlStr).hostname;
  } catch {
    const m = urlStr.match(/@([^/:?]+)/);
    return m ? m[1] : "neon-postgres-cluster";
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    },
  });
}

function errorResponse(message: string, status = 500, details?: any): Response {
  return jsonResponse(
    { error: message, ...(details ? { details } : {}) },
    status,
  );
}

function safeJsonParse<T>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// RFC 2046 Dual-Part Plain-Text converter for Edge runtime
function htmlToPlainText(html: string): string {
  if (!html || typeof html !== "string") return "";
  try {
    let text = html;
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, "");
    text = text.replace(/<!--[\s\S]*?-->/g, "");
    text = text.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, anchor) => {
      const cleanHref = href.trim();
      const cleanAnchor = anchor.replace(/<[^>]+>/g, "").trim();
      if (!cleanHref || cleanHref.startsWith("javascript:")) return cleanAnchor;
      if (!cleanAnchor || cleanAnchor.toLowerCase() === cleanHref.toLowerCase()) return cleanHref;
      return `${cleanAnchor} [${cleanHref}]`;
    });
    text = text.replace(/<img\s+(?:[^>]*?\s+)?alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => {
      const cleanAlt = alt.trim();
      return cleanAlt ? `[${cleanAlt}]` : "";
    });
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<\/(h[1-6]|div|tr)>/gi, "\n\n");
    text = text.replace(/<hr\s*\/?>/gi, "\n---\n");
    text = text.replace(/<li>([\s\S]*?)<\/li>/gi, (_, content) => {
      const cleanContent = content.replace(/<[^>]+>/g, "").trim();
      return `\n• ${cleanContent}`;
    });
    text = text.replace(/<\/(ul|ol)>/gi, "\n\n");
    text = text.replace(/<\/td>/gi, "\t");
    text = text.replace(/<[^>]+>/g, "");
    // Replace common entities
    const entities: Record<string, string> = {
      "&nbsp;": " ",
      "&#160;": " ",
      "&amp;": "&",
      "&#38;": "&",
      "&lt;": "<",
      "&#60;": "<",
      "&gt;": ">",
      "&#62;": ">",
      "&quot;": '"',
      "&#34;": '"',
      "&#39;": "'",
      "&apos;": "'",
      "&bull;": "•",
      "&#8226;": "•",
      "&mdash;": "—",
      "&ndash;": "–",
      "&copy;": "©",
    };
    for (const [k, v] of Object.entries(entities)) {
      if (text.includes(k)) text = text.split(k).join(v);
    }
    text = text.replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
    });
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");
    return text.split("\n").map((l) => l.trim()).join("\n").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

// Anti-Spam & Deliverability RFC-8058 Header Helpers
function sanitizeHeaderValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
}

function extractDomainFromEmail(emailOrFrom?: string): string {
  if (!emailOrFrom || typeof emailOrFrom !== "string") return "resend.dev";
  const clean = sanitizeHeaderValue(emailOrFrom);
  const bracketMatch = clean.match(/<([^>]+)>/);
  const target = bracketMatch ? bracketMatch[1] : clean;
  const emailMatch = target.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch) return "resend.dev";
  const fullEmail = emailMatch[1];
  const atIndex = fullEmail.indexOf("@");
  if (atIndex !== -1 && atIndex < fullEmail.length - 1) {
    const domain = fullEmail.slice(atIndex + 1).replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase().trim();
    if (domain && domain.includes(".")) return domain;
  }
  return "resend.dev";
}

function isValidEmailAddress(email?: string): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = sanitizeHeaderValue(email).trim();
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean);
}

function sanitizeReplyTo(rawReplyTo?: string): string | undefined {
  if (!rawReplyTo || typeof rawReplyTo !== "string") return undefined;
  const sanitized = sanitizeHeaderValue(rawReplyTo).trim();
  if (!sanitized) return undefined;
  const match = sanitized.match(/^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  if (match) {
    const displayName = match[1].replace(/[<>"]/g, "").trim();
    const email = match[2].trim().toLowerCase();
    if (isValidEmailAddress(email)) {
      if (!displayName) return email;
      const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(displayName);
      const formattedName = needsQuoting ? `"${displayName}"` : displayName;
      return `${formattedName} <${email}>`;
    }
    return undefined;
  }
  const cleanEmail = sanitized.replace(/[<>"]/g, "").trim().toLowerCase();
  if (isValidEmailAddress(cleanEmail)) {
    return cleanEmail;
  }
  return undefined;
}

function resolveAutoReplyTo(
  rawReplyTo?: string,
  fromEmail?: string,
  autoReplyTo: boolean = false
): string | undefined {
  if (!autoReplyTo) {
    return sanitizeReplyTo(rawReplyTo);
  }

  // Preserve valid full email addresses untouched
  if (rawReplyTo && typeof rawReplyTo === "string" && rawReplyTo.trim().length > 0) {
    const cleanRaw = sanitizeHeaderValue(rawReplyTo).trim();
    const sanitizedValidEmail = sanitizeReplyTo(cleanRaw);
    if (sanitizedValidEmail) {
      return sanitizedValidEmail;
    }

    if (/^[a-zA-Z0-9._%+-]+$/.test(cleanRaw)) {
      const senderDomain = extractDomainFromEmail(fromEmail);
      if (senderDomain && senderDomain !== "resend.dev") {
        return `${cleanRaw.toLowerCase()}@${senderDomain}`;
      }
    }
  }
 
  // If no custom Reply-To was provided (or was empty), autoReplyTo defaults to the active sender's own address
  if (!fromEmail || typeof fromEmail !== "string") {
    return undefined;
  }

  const cleanFrom = sanitizeHeaderValue(fromEmail).trim();
  const fromBracketMatch = cleanFrom.match(/^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  let senderBareEmail = "";
  let senderDisplayName = "";
  if (fromBracketMatch) {
    senderDisplayName = fromBracketMatch[1].replace(/[<>"]/g, "").trim();
    senderBareEmail = fromBracketMatch[2].trim().toLowerCase();
  } else {
    const directEmailMatch = cleanFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (directEmailMatch) {
      senderBareEmail = directEmailMatch[1].trim().toLowerCase();
    }
  }

  if (senderBareEmail) {
    if (!senderDisplayName) return senderBareEmail;
    const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(senderDisplayName);
    const formattedName = needsQuoting ? `"${senderDisplayName}"` : senderDisplayName;
    return `${formattedName} <${senderBareEmail}>`;
  }

  // Under NO circumstance synthesize non-existent support@ mailboxes that fail MX probes
  return undefined;
}

function generateAntiSpamHeaders(options: {
  fromEmail?: string;
  recipientEmail: string;
  replyTo?: string;
  autoReplyTo?: boolean;
  unsubscribeUrl?: string;
  defaultUnsubscribeUrl?: string;
  enableGlobalUnsubscribe?: boolean;
  unsubscribeMailto?: string;
  enableOneClickUnsubscribe?: boolean;
  customHeaders?: Record<string, string>;
  origin?: string;
}): { replyTo?: string; headers: Record<string, string> } {
  const {
    fromEmail,
    recipientEmail,
    replyTo,
    autoReplyTo = false,
    unsubscribeUrl,
    defaultUnsubscribeUrl,
    enableGlobalUnsubscribe = true,
    unsubscribeMailto,
    enableOneClickUnsubscribe = true,
    customHeaders = {},
    origin,
  } = options;

  const resultHeaders: Record<string, string> = {};

  if (customHeaders && typeof customHeaders === "object") {
    for (const [key, val] of Object.entries(customHeaders)) {
      const cleanKey = sanitizeHeaderValue(key);
      const cleanVal = sanitizeHeaderValue(val);
      if (cleanKey && cleanVal) {
        resultHeaders[cleanKey] = cleanVal;
      }
    }
  }

  const resolvedReplyTo = resolveAutoReplyTo(replyTo, fromEmail, autoReplyTo);

  if (enableOneClickUnsubscribe) {
    const domain = extractDomainFromEmail(fromEmail);
    const cleanRecipient = sanitizeHeaderValue(recipientEmail).trim();
    const encodedRecipient = encodeURIComponent(cleanRecipient);

    let finalUnsubUrl = "";
    let cleanCustomUrl = unsubscribeUrl ? sanitizeHeaderValue(unsubscribeUrl).trim() : "";
    if (!cleanCustomUrl && enableGlobalUnsubscribe && defaultUnsubscribeUrl) {
      cleanCustomUrl = sanitizeHeaderValue(defaultUnsubscribeUrl).trim();
    }

    if (cleanCustomUrl) {
      if (cleanCustomUrl.toLowerCase().startsWith("mailto:")) {
        resultHeaders["List-Unsubscribe"] = `<${cleanCustomUrl}>`;
      } else {
        let httpsUrl = cleanCustomUrl;
        if (httpsUrl.startsWith("http://")) {
          httpsUrl = `https://${httpsUrl.slice(7)}`;
        } else if (!httpsUrl.startsWith("https://")) {
          httpsUrl = `https://${httpsUrl}`;
        }

        if (httpsUrl.includes("{EMAIL}")) {
          finalUnsubUrl = httpsUrl.replace(/{EMAIL}/g, encodedRecipient);
        } else if (httpsUrl.includes("?")) {
          finalUnsubUrl = `${httpsUrl}&email=${encodedRecipient}`;
        } else {
          finalUnsubUrl = `${httpsUrl}?email=${encodedRecipient}`;
        }

        const explicitMailto = unsubscribeMailto ? sanitizeHeaderValue(unsubscribeMailto).trim() : "";
        if (explicitMailto && isValidEmailAddress(explicitMailto.replace(/^mailto:/i, ""))) {
          const cleanMailtoAddress = explicitMailto.replace(/^mailto:/i, "").trim();
          const mailtoUri = `mailto:${cleanMailtoAddress}?subject=unsubscribe%20${encodedRecipient}`;
          resultHeaders["List-Unsubscribe"] = `<${mailtoUri}>, <${finalUnsubUrl}>`;
        } else {
          resultHeaders["List-Unsubscribe"] = `<${finalUnsubUrl}>`;
        }
        resultHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
    } else {
      // If user did not provide custom unsubscribe URL, only attach mailto if explicitly configured
      const explicitMailto = unsubscribeMailto ? sanitizeHeaderValue(unsubscribeMailto).trim() : "";
      if (explicitMailto && isValidEmailAddress(explicitMailto.replace(/^mailto:/i, ""))) {
        const cleanMailtoAddress = explicitMailto.replace(/^mailto:/i, "").trim();
        const mailtoUri = `mailto:${cleanMailtoAddress}?subject=unsubscribe%20${encodedRecipient}`;
        resultHeaders["List-Unsubscribe"] = `<${mailtoUri}>`;
      }
      // Zero fake /unsubscribe endpoints synthesized to prevent 404 POST probe failures under RFC 8058
    }
  }

  return {
    replyTo: resolvedReplyTo,
    headers: resultHeaders,
  };
}

// Auth Helpers
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getRuntimeSecret(env: Env): string {
  const secret = env.JWT_SECRET || env.AUTH_SECRET || "";
  if (!secret) {
    console.warn(
      "[Cloudflare Auth] WARNING: JWT_SECRET / AUTH_SECRET is not configured. Using development-only fallback.",
    );
  }
  return secret || "cf_r_sender_development_secret_change_me";
}

function hashPassword(password: string): string {
  const salt = bytesToHex(crypto.randomBytes(16));
  const hash = bytesToHex(
    crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512"),
  );
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    const computed = bytesToHex(
      crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512"),
    );
    return timingSafeEqual(hash, computed);
  } catch {
    return false;
  }
}

function generateToken(
  user: any,
  secret = "cf_r_sender_development_secret_change_me",
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    }),
  );
  const signature = (
    (
      crypto.createHmac("sha256", secret).update(`${header}.${payload}`) as any
    ).digest("base64") as string
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(
  token: string,
  secret = "cf_r_sender_development_secret_change_me",
): any {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const expected = (
      (
        crypto
          .createHmac("sha256", secret)
          .update(`${header}.${payload}`) as any
      ).digest("base64") as string
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (!timingSafeEqual(signature, expected)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

function formatUser(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    dailyLimit: Number(r.daily_limit ?? r.dailyLimit ?? 5000),
    usedToday: Number(r.used_today ?? r.usedToday ?? 0),
    lastLogin: r.last_login || r.lastLogin || "Never",
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
  };
}

// Database query runner for Cloudflare Edge
// Uses stateless HTTPS neon() driver to avoid WebSocket disconnects and connection pool leaks
async function runQuery(
  env: Env,
  sql: string,
  params: any[] = [],
): Promise<any[]> {
  const dbUrl = getDbUrl(env);
  if (!dbUrl)
    throw new Error(
      "Database URL is not configured. Set DATABASE_URL in Cloudflare Pages Settings.",
    );

  const sqlClient = neon(dbUrl);
  const rows = await sqlClient.query(sql, params);
  return (rows as any[]) || [];
}

// Ensure database schema and tables exist on Cloudflare Pages
let _schemaInitialized = false;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS neon_settings (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS neon_apis (
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
  )`,
  `CREATE TABLE IF NOT EXISTS neon_users (
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
  )`,
  `CREATE TABLE IF NOT EXISTS neon_content (
    id VARCHAR(50) PRIMARY KEY,
    sender_names JSONB DEFAULT '["Support Team"]'::jsonb,
    subjects JSONB DEFAULT '["Update regarding your account {name}", "Important notification for {company}"]'::jsonb,
    body_html TEXT,
    body_text TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    track_opens BOOLEAN DEFAULT FALSE,
    track_clicks BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS neon_presets (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    sender VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    html TEXT,
    text TEXT,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS neon_tasks (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'idle',
    api_ids JSONB DEFAULT '[]'::jsonb,
    recipients JSONB DEFAULT '[]'::jsonb,
    stats JSONB DEFAULT '{"total":0,"success":0,"failed":0,"remaining":0}'::jsonb,
    current_log TEXT DEFAULT '',
    progress INT DEFAULT 0,
    delay_ms INT DEFAULT 3000,
    sender_name VARCHAR(255),
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    attachments_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at VARCHAR(100),
    completed_at VARCHAR(100)
  )`,
  `CREATE TABLE IF NOT EXISTS neon_logs (
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
  )`,
  `CREATE TABLE IF NOT EXISTS neon_storage_config (
    id VARCHAR(50) PRIMARY KEY,
    provider VARCHAR(50) DEFAULT 'supabase_s3',
    endpoint TEXT DEFAULT '',
    region VARCHAR(100) DEFAULT 'us-east-1',
    bucket VARCHAR(255) DEFAULT '',
    access_key_id TEXT DEFAULT '',
    secret_access_key TEXT DEFAULT '',
    public_url_base TEXT DEFAULT '',
    force_path_style BOOLEAN DEFAULT TRUE,
    is_enabled BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'unconfigured',
    last_tested TIMESTAMP,
    test_message TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS neon_uploaded_files (
    id VARCHAR(100) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    s3_key TEXT NOT NULL,
    s3_url TEXT NOT NULL,
    bucket VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(100) DEFAULT '',
    source VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`,
  `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS daily_limit INT DEFAULT 5000;`,
  `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS used_today INT DEFAULT 0;`,
  `ALTER TABLE neon_users ADD COLUMN IF NOT EXISTS last_login VARCHAR(100) DEFAULT 'Never';`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) DEFAULT '';`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS provider_type VARCHAR(50) DEFAULT 'resend';`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_port INT DEFAULT 587;`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT FALSE;`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);`,
  `ALTER TABLE neon_apis ADD COLUMN IF NOT EXISTS smtp_pass TEXT;`,
  `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS api_ids JSONB DEFAULT '[]'::jsonb;`,
  `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS reply_to TEXT;`,
  `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS auto_reply_to BOOLEAN DEFAULT TRUE;`,
  `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT;`,
  `ALTER TABLE neon_content ADD COLUMN IF NOT EXISTS enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE;`,
  `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS reply_to TEXT;`,
  `CREATE TABLE IF NOT EXISTS neon_domains (
    id VARCHAR(100) PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    source VARCHAR(50) DEFAULT 'auto',
    domain_type VARCHAR(50) DEFAULT 'custom',
    status VARCHAR(50) DEFAULT 'active',
    is_verified BOOLEAN DEFAULT TRUE,
    request_count INT DEFAULT 0,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS auto_reply_to BOOLEAN DEFAULT TRUE;`,
  `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT;`,
  `ALTER TABLE neon_tasks ADD COLUMN IF NOT EXISTS enable_one_click_unsubscribe BOOLEAN DEFAULT TRUE;`,
  `ALTER TABLE neon_content ALTER COLUMN track_opens SET DEFAULT FALSE;`,
  `ALTER TABLE neon_content ALTER COLUMN track_clicks SET DEFAULT FALSE;`,
  `UPDATE neon_content SET track_opens = FALSE, track_clicks = FALSE WHERE track_opens = TRUE OR track_clicks = TRUE;`
];

async function ensureSchema(env: Env) {
  if (_schemaInitialized) return;
  const dbUrl = getDbUrl(env);
  if (!dbUrl) return;

  try {
    for (const stmt of DDL_STATEMENTS) {
      await runQuery(env, stmt).catch(() => {});
    }
    _schemaInitialized = true;
  } catch (err: any) {
    console.warn("[Cloudflare DB] Schema ensure check:", err?.message);
  }
}

// Main Catchall Handler for Cloudflare Pages
export async function onRequest(context: EventContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  // Handle CORS Preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // Ensure tables exist for requests hitting API routes
    if (path.startsWith("/api")) {
      await ensureSchema(env);
    }

    let body: any = {};
    if (method !== "GET" && method !== "HEAD") {
      try {
        const text = await request.text();
        if (text) body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    // -------------------------------------------------------------
    // CLOUDFLARE EDGE & NETWORK IP RESOLVER
    // Returns Cloudflare edge-connecting IP and colocation metadata
    // -------------------------------------------------------------
    if (path === "/api/ip" || path === "/api/client-ip") {
      const cfConnectingIp = request.headers.get("cf-connecting-ip");
      const xForwardedFor = request.headers.get("x-forwarded-for");
      const xRealIp = request.headers.get("x-real-ip");
      const cf = (request as any).cf || {};

      const ip =
        cfConnectingIp ||
        (xForwardedFor ? xForwardedFor.split(",")[0].trim() : "") ||
        xRealIp ||
        "127.0.0.1";

      return jsonResponse({
        ip,
        isCloudflare: Boolean(cfConnectingIp || cf.colo),
        country: cf.country || request.headers.get("cf-ipcountry") || null,
        city: cf.city || null,
        colo: cf.colo || null,
        asn: cf.asn || null,
      });
    }

    // -------------------------------------------------------------
    // NEON DATABASE ENDPOINTS
    // -------------------------------------------------------------
    if (path === "/api/neon/health") {
      const dbUrl = getDbUrl(env);
      if (!dbUrl) {
        return jsonResponse({
          status: "unconfigured",
          connected: false,
          host: "No Database Configured",
          message: "DATABASE_URL environment variable is missing",
        });
      }

      const startTime = Date.now();
      try {
        const rows = await runQuery(
          env,
          `SELECT
            NOW() as time,
            version() as version,
            current_database() as database,
            current_user as user,
            (SELECT COUNT(*) FROM neon_apis) as apis_count,
            (SELECT COUNT(*) FROM neon_users) as users_count,
            (SELECT COUNT(*) FROM neon_tasks) as tasks_count,
            (SELECT COUNT(*) FROM neon_logs) as logs_count`,
        );
        const latency = Date.now() - startTime;
        const row = rows[0] || {};
        return jsonResponse({
          status: "ok",
          connected: true,
          endpoint: extractDbHost(dbUrl),
          database: row.database || "unknown",
          user: row.user || "unknown",
          pgVersion: row.version || "PostgreSQL (Neon)",
          latencyMs: latency,
          timestamp: row.time || new Date().toISOString(),
          counts: {
            apis: Number(row.apis_count || 0),
            users: Number(row.users_count || 0),
            tasks: Number(row.tasks_count || 0),
            logs: Number(row.logs_count || 0),
          },
        });
      } catch (err: any) {
        return jsonResponse({
          status: "error",
          connected: false,
          host: extractDbHost(dbUrl),
          error: err.message,
        });
      }
    }

    if (path === "/api/neon/test" && method === "POST") {
      const { connectionString } = body;
      const target = connectionString || getDbUrl(env);
      if (!target) return errorResponse("Connection string is required", 400);

      const start = Date.now();
      let testPool;
      try {
        testPool = new Pool({ connectionString: target });
        const res = await testPool.query(
          "SELECT current_database() as db, version() as ver, NOW() as time",
        );
        const rows = res.rows;
        return jsonResponse({
          connected: true,
          latencyMs: Date.now() - start,
          pingMs: Date.now() - start,
          host: extractDbHost(target),
          endpoint: extractDbHost(target),
          database: rows[0]?.db,
          version: rows[0]?.ver,
          time: rows[0]?.time,
          message: `Connected successfully to database "${rows[0]?.db || "neondb"}"`,
        });
      } catch (err: any) {
        return errorResponse(err.message || "Connection failed", 400);
      } finally {
        if (testPool) {
          await testPool.end().catch(() => {});
        }
      }
    }

    if (path === "/api/neon/schema") {
      const rows = await runQuery(
        env,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
      );
      return jsonResponse({ tables: rows.map((r: any) => r.table_name) });
    }

    if (path === "/api/neon/stats") {
      const rows = await runQuery(
        env,
        `
        SELECT
          (SELECT COUNT(*) FROM neon_apis) as apis_count,
          (SELECT COUNT(*) FROM neon_tasks) as tasks_count,
          (SELECT COUNT(*) FROM neon_logs) as logs_count,
          (SELECT COUNT(*) FROM neon_users) as users_count,
          (SELECT COUNT(*) FROM neon_uploaded_files) as files_count;
      `,
      );
      return jsonResponse({ stats: rows[0] });
    }

    if (path === "/api/neon/query" && method === "POST") {
      const { sql, params } = body;
      if (!sql) return errorResponse("SQL query is required", 400);
      const rows = await runQuery(env, sql, params || []);
      return jsonResponse({ rows, count: rows.length });
    }

    // -------------------------------------------------------------
    // AUTHENTICATION ENDPOINTS
    // -------------------------------------------------------------
    if (path === "/api/auth/setup-status" || path === "/api/auth/status") {
      try {
        const rows = await runQuery(
          env,
          `SELECT COUNT(*) as count FROM neon_users WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%'`,
        );
        const count = parseInt(rows[0]?.count || "0", 10);
        return jsonResponse({ isSetup: count > 0, adminExists: count > 0 });
      } catch (err: any) {
        return jsonResponse({ isSetup: false, adminExists: false, error: err?.message || "Failed to query users" });
      }
    }

    if (path === "/api/auth/setup-admin" && method === "POST") {
      const { name, email, password } = body;
      if (!name || !email || !password)
        return errorResponse("Name, email, and password are required", 400);

      const existing = await runQuery(
        env,
        `SELECT id FROM neon_users WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%' LIMIT 1`,
      );
      if (existing.length > 0) {
        return jsonResponse(
          {
            error: "Admin user already configured",
            message: "Platform already has an administrator configured. Please sign in via /vcon.",
            adminExists: true,
          },
          409,
        );
      }

      const id = `usr_${Date.now()}`;
      const hashed = hashPassword(password);
      await runQuery(
        env,
        `INSERT INTO neon_users (id, name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, 'admin', 'active')`,
        [id, name, email.toLowerCase().trim(), hashed],
      );

      const secret = getRuntimeSecret(env);
      const token = generateToken({ id, name, email, role: "admin" }, secret);
      return jsonResponse({
        success: true,
        token,
        admin: { id, name, email, role: "admin", status: "active" },
      });
    }

    if (path === "/api/auth/admin-login" && method === "POST") {
      const { email, password } = body;
      if (!password)
        return errorResponse("Admin password is required", 400);

      let rows: any[] = [];
      if (email && email.trim()) {
        rows = await runQuery(
          env,
          `SELECT * FROM neon_users WHERE LOWER(email) = $1 AND (LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%') LIMIT 1`,
          [email.toLowerCase().trim()],
        );
      } else {
        rows = await runQuery(
          env,
          `SELECT * FROM neon_users WHERE LOWER(role) = 'admin' OR LOWER(role) = 'super_admin' OR LOWER(role) LIKE '%admin%' LIMIT 1`,
        );
      }

      if (rows.length === 0)
        return errorResponse("No administrator found matching credentials", 404);

      const adminUser = rows[0];
      const valid = verifyPassword(password, adminUser.password_hash);
      if (!valid) return errorResponse("Invalid administrator credentials", 401);

      await runQuery(
        env,
        `UPDATE neon_users SET last_login = TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1`,
        [adminUser.id],
      );

      const token = generateToken(adminUser, getRuntimeSecret(env));
      return jsonResponse({
        success: true,
        token,
        admin: formatUser(adminUser),
      });
    }

    if (path === "/api/auth/verify" && method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim() || body?.token;
      if (!token) return jsonResponse({ valid: false, error: "No token provided" }, 401);

      const decoded = verifyToken(token, getRuntimeSecret(env));
      if (!decoded) return jsonResponse({ valid: false, error: "Invalid or expired token" }, 401);

      const rows = await runQuery(
        env,
        `SELECT id, name, email, role, status, created_at, last_login FROM neon_users WHERE id = $1 LIMIT 1`,
        [decoded.id],
      );
      if (rows.length === 0 || rows[0].status === "deactivated" || rows[0].status === "suspended") {
        return jsonResponse({ valid: false, error: "Account deactivated or not found" }, 403);
      }
      return jsonResponse({ valid: true, user: rows[0] });
    }

    if (path === "/api/auth/change-password" && method === "POST") {
      const { currentPassword, newPassword, userId } = body;
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const decoded = verifyToken(token, getRuntimeSecret(env));

      const targetId = userId || decoded?.id;
      if (!targetId) return errorResponse("Authentication required to change password", 401);

      const rows = await runQuery(
        env,
        `SELECT * FROM neon_users WHERE id = $1 LIMIT 1`,
        [targetId],
      );
      if (rows.length === 0) return errorResponse("User not found", 404);

      if (currentPassword) {
        const valid = verifyPassword(currentPassword, rows[0].password_hash);
        if (!valid) return errorResponse("Current password is incorrect", 400);
      }

      if (!newPassword || newPassword.length < 6) {
        return errorResponse("New password must be at least 6 characters", 400);
      }

      const newHash = hashPassword(newPassword);
      await runQuery(
        env,
        `UPDATE neon_users SET password_hash = $1 WHERE id = $2`,
        [newHash, targetId],
      );
      return jsonResponse({ success: true, message: "Password updated successfully" });
    }

    if (path === "/api/auth/login" && method === "POST") {
      const { email, password } = body;
      if (!email || !password)
        return errorResponse("Email and password are required", 400);

      const rows = await runQuery(
        env,
        `SELECT * FROM neon_users WHERE email = $1 LIMIT 1`,
        [email.toLowerCase().trim()],
      );
      if (rows.length === 0)
        return errorResponse("Invalid email or password", 401);

      const user = rows[0];
      if (user.status === "suspended")
        return errorResponse(
          "Account is suspended. Contact administrator.",
          403,
        );

      const valid = verifyPassword(password, user.password_hash);
      if (!valid) return errorResponse("Invalid email or password", 401);

      // Update last login
      await runQuery(
        env,
        `UPDATE neon_users SET last_login = TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1`,
        [user.id],
      );

      const token = generateToken(user, getRuntimeSecret(env));
      return jsonResponse({ success: true, token, user: formatUser(user) });
    }

    if (path === "/api/auth/profile") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const decoded = verifyToken(token, getRuntimeSecret(env));
      if (!decoded) return errorResponse("Unauthorized", 401);

      const rows = await runQuery(
        env,
        `SELECT id, name, email, role, status, created_at, last_login FROM neon_users WHERE id = $1 LIMIT 1`,
        [decoded.id],
      );
      if (rows.length === 0) return errorResponse("User not found", 404);
      return jsonResponse({ user: rows[0] });
    }

    if (path === "/api/users" || path === "/api/auth/users") {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT id, name, email, role, status, daily_limit, used_today, last_login, created_at FROM neon_users ORDER BY created_at ASC`,
        );
        return jsonResponse(rows.map(formatUser));
      }
      if (method === "POST") {
        const { name, email, password, role, dailyLimit, status } = body;
        if (!name || !name.trim())
          return errorResponse("User name is required", 400);
        if (!email || !email.trim())
          return errorResponse("Email address is required", 400);
        if (!password || !password.trim())
          return errorResponse("Password is required", 400);

        const check = await runQuery(
          env,
          `SELECT id FROM neon_users WHERE LOWER(email) = $1`,
          [email.toLowerCase().trim()],
        );
        if (check.length > 0)
          return errorResponse("A user with this email already exists", 400);

        const id = `usr_${Date.now()}`;
        const hashed = hashPassword(password.trim());
        const rows = await runQuery(
          env,
          `INSERT INTO neon_users (id, name, email, password_hash, role, status, daily_limit, used_today, last_login)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'Never')
           RETURNING id, name, email, role, status, daily_limit, used_today, last_login, created_at`,
          [
            id,
            name.trim(),
            email.toLowerCase().trim(),
            hashed,
            role || "user",
            status || "active",
            Number(dailyLimit) || 5000,
          ],
        );
        return jsonResponse(formatUser(rows[0]));
      }
    }

    // Single User Mutations: /api/users/:id or /api/auth/users/:id
    const userMatch = path.match(/^\/api\/(?:auth\/)?users\/([^/]+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      if (method === "DELETE") {
        await runQuery(env, `DELETE FROM neon_users WHERE id = $1`, [userId]);
        return jsonResponse({ success: true, message: "User removed" });
      }
      if (method === "PUT" || method === "PATCH") {
        const { name, email, password, role, status, dailyLimit, usedToday } =
          body;
        let query = "";
        let params: any[] = [];
        if (password && password.trim()) {
          const hashed = hashPassword(password.trim());
          query = `UPDATE neon_users
                   SET name = COALESCE($1, name),
                       email = COALESCE($2, email),
                       password_hash = $3,
                       role = COALESCE($4, role),
                       status = COALESCE($5, status),
                       daily_limit = COALESCE($6, daily_limit),
                       used_today = COALESCE($7, used_today)
                   WHERE id = $8
                   RETURNING id, name, email, role, status, daily_limit, used_today, last_login, created_at`;
          params = [
            name ?? null,
            email ? email.toLowerCase().trim() : null,
            hashed,
            role ?? null,
            status ?? null,
            dailyLimit !== undefined ? Number(dailyLimit) : null,
            usedToday !== undefined ? Number(usedToday) : null,
            userId,
          ];
        } else {
          query = `UPDATE neon_users
                   SET name = COALESCE($1, name),
                       email = COALESCE($2, email),
                       role = COALESCE($3, role),
                       status = COALESCE($4, status),
                       daily_limit = COALESCE($5, daily_limit),
                       used_today = COALESCE($6, used_today)
                   WHERE id = $7
                   RETURNING id, name, email, role, status, daily_limit, used_today, last_login, created_at`;
          params = [
            name ?? null,
            email ? email.toLowerCase().trim() : null,
            role ?? null,
            status ?? null,
            dailyLimit !== undefined ? Number(dailyLimit) : null,
            usedToday !== undefined ? Number(usedToday) : null,
            userId,
          ];
        }
        const updated = await runQuery(env, query, params);
        if (updated.length === 0) return errorResponse("User not found", 404);
        return jsonResponse(formatUser(updated[0]));
      }
    }

    const userRoleMatch = path.match(/^\/api\/(?:auth\/)?users\/([^/]+)\/role$/);
    if (userRoleMatch && method === "PATCH") {
      const userId = userRoleMatch[1];
      const { role } = body;
      await runQuery(env, `UPDATE neon_users SET role = $1 WHERE id = $2`, [
        role,
        userId,
      ]);
      return jsonResponse({ success: true });
    }

    const userPassMatch = path.match(
      /^\/api\/(?:auth\/)?users\/([^/]+)\/(?:reset-password|password)$/,
    );
    if (userPassMatch && method === "PATCH") {
      const userId = userPassMatch[1];
      const { newPassword, password } = body;
      const targetPass = newPassword || password;
      if (!targetPass) return errorResponse("New password is required", 400);
      const hashed = hashPassword(targetPass);
      await runQuery(
        env,
        `UPDATE neon_users SET password_hash = $1 WHERE id = $2`,
        [hashed, userId],
      );
      return jsonResponse({ success: true });
    }

    // -------------------------------------------------------------
    // RESEND API KEYS (/api/apis)
    // -------------------------------------------------------------
    if (path === "/api/apis") {
      if (method === "GET") {
        const userId = (
          new URL(request.url).searchParams.get("userId") || ""
        ).trim();
        const rows = userId
          ? await runQuery(
              env,
              `SELECT * FROM neon_apis WHERE user_id = $1 OR user_id = '' ORDER BY created_at DESC`,
              [userId],
            )
          : await runQuery(
              env,
              `SELECT * FROM neon_apis ORDER BY created_at DESC`,
            );
        return jsonResponse(
          rows.map((r: any) => ({
            id: r.id,
            userId: r.user_id || "",
            name: r.name,
            key: r.key,
            senderEmail: r.sender_email,
            dailyLimit: Number(r.daily_limit) || 1000,
            usedToday: Number(r.used_today) || 0,
            status: r.status || "active",
            provider_type: r.provider_type || "resend",
            smtp_host: r.smtp_host || "",
            smtp_port: Number(r.smtp_port) || 587,
            smtp_secure: Boolean(r.smtp_secure),
            smtp_user: r.smtp_user || "",
            smtp_pass: r.smtp_pass || "",
            lastTested: r.last_tested || "",
            testStatusMsg: r.test_status_msg || "",
            createdAt: r.created_at
              ? (typeof r.created_at === "string"
                  ? r.created_at.split("T")[0]
                  : new Date(r.created_at).toISOString().split("T")[0])
              : "",
          })),
        );
      }
      if (method === "POST") {
        const {
          id,
          name,
          key,
          senderEmail,
          dailyLimit,
          usedToday,
          status,
          lastTested,
          testStatusMsg,
          userId,
          provider_type,
          providerType,
          smtp_host,
          smtpHost,
          smtp_port,
          smtpPort,
          smtp_secure,
          smtpSecure,
          smtp_user,
          smtpUser,
          smtp_pass,
          smtpPass,
        } = body;
        
        const isSmtp = (provider_type || providerType) === 'smtp';

        if (!name || (!key && !isSmtp)) {
          return errorResponse("API name and key are required", 400);
        }
        const apiId =
          id || `api_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const nowIso = new Date().toISOString().split("T")[0];
        await runQuery(
          env,
          `INSERT INTO neon_apis (id, user_id, name, key, sender_email, daily_limit, used_today, status, last_tested, test_status_msg, created_at, provider_type, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             name = EXCLUDED.name,
             key = EXCLUDED.key,
             sender_email = EXCLUDED.sender_email,
             daily_limit = EXCLUDED.daily_limit,
             used_today = EXCLUDED.used_today,
             status = EXCLUDED.status,
             last_tested = EXCLUDED.last_tested,
             test_status_msg = EXCLUDED.test_status_msg,
             provider_type = EXCLUDED.provider_type,
             smtp_host = EXCLUDED.smtp_host,
             smtp_port = EXCLUDED.smtp_port,
             smtp_secure = EXCLUDED.smtp_secure,
             smtp_user = EXCLUDED.smtp_user,
             smtp_pass = EXCLUDED.smtp_pass;`,
          [
            apiId,
            userId || "",
            name,
            key || "",
            senderEmail || "",
            Number(dailyLimit) || 1000,
            Number(usedToday) || 0,
            status || "active",
            lastTested || "Just now",
            testStatusMsg || "",
            (provider_type || providerType) || "resend",
            (smtp_host || smtpHost) || null,
            (smtp_port !== undefined ? smtp_port : smtpPort) || 587,
            (smtp_secure !== undefined ? smtp_secure : smtpSecure) || false,
            (smtp_user || smtpUser) || null,
            (smtp_pass || smtpPass) || null,
          ],
        );

        try {
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, level, message, api_name, created_at)
             VALUES ($1, 'success', $2, $3, NOW())`,
            [
              `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              `Registered new API Key in Neon: "${name}" (${senderEmail || "No sender set"})`,
              name,
            ],
          );
        } catch {}

        return jsonResponse({
          id: apiId,
          userId: userId || "",
          name,
          key,
          senderEmail: senderEmail || "",
          dailyLimit: Number(dailyLimit) || 1000,
          usedToday: Number(usedToday) || 0,
          status: status || "active",
          lastTested: lastTested || "Just now",
          testStatusMsg: testStatusMsg || "",
          createdAt: nowIso,
          provider_type: (provider_type || providerType) || "resend",
          smtp_host: (smtp_host || smtpHost) || null,
          smtp_port: (smtp_port !== undefined ? smtp_port : smtpPort) || 587,
          smtp_secure: (smtp_secure !== undefined ? smtp_secure : smtpSecure) || false,
          smtp_user: (smtp_user || smtpUser) || null,
          smtp_pass: (smtp_pass || smtpPass) || null,
        });
      }
    }

    const apiItemMatch = path.match(/^\/api\/apis\/([^/]+)$/);
    if (apiItemMatch) {
      const apiId = apiItemMatch[1];
      if (method === "DELETE") {
        await runQuery(env, `DELETE FROM neon_apis WHERE id = $1`, [apiId]);
        try {
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, level, message, created_at)
             VALUES ($1, 'warn', $2, NOW())`,
            [
              `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              `Deleted API key (${apiId}) from Neon database`,
            ],
          );
        } catch {}
        return jsonResponse({ success: true });
      }
      if (method === "PUT") {
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
          provider_type,
          providerType,
          smtp_host,
          smtpHost,
          smtp_port,
          smtpPort,
          smtp_secure,
          smtpSecure,
          smtp_user,
          smtpUser,
          smtp_pass,
          smtpPass,
        } = body;
        await runQuery(
          env,
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
               provider_type = COALESCE($11, provider_type),
               smtp_host = COALESCE($12, smtp_host),
               smtp_port = COALESCE($13, smtp_port),
               smtp_secure = COALESCE($14, smtp_secure),
               smtp_user = COALESCE($15, smtp_user),
               smtp_pass = COALESCE($16, smtp_pass)
           WHERE id = $10`,
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
            apiId,
            (provider_type || providerType) ?? null,
            (smtp_host || smtpHost) ?? null,
            (smtp_port !== undefined ? smtp_port : smtpPort) ?? null,
            (smtp_secure !== undefined ? smtp_secure : smtpSecure) ?? null,
            (smtp_user || smtpUser) ?? null,
            (smtp_pass || smtpPass) ?? null,
          ],
        );
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // CONTENT CONFIGURATION (/api/content)
    // -------------------------------------------------------------
    if (path === "/api/content") {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_content WHERE id = 'default_content' LIMIT 1`,
        );
        if (rows.length === 0) {
          return jsonResponse({
            senderNames: ["R Sender Support"],
            subjects: ["Quick update regarding your account {name}"],
            bodyHtml:
              "<p>Hello {name},</p><p>We have an important update for you.</p>",
            bodyText: "Hello {name},\nWe have an important update for you.",
            attachments: [],
            trackOpens: false,
            trackClicks: false,
            replyTo: "",
            autoReplyTo: true,
            unsubscribeUrl: "",
            enableOneClickUnsubscribe: true,
          });
        }
        const r = rows[0];
        return jsonResponse({
          senderNames: r.sender_names || [],
          subjects: r.subjects || [],
          bodyHtml: r.body_html || "",
          bodyText: r.body_text || "",
          attachments: r.attachments || [],
          trackOpens: Boolean(r.track_opens),
          trackClicks: Boolean(r.track_clicks),
          replyTo: r.reply_to || "",
          autoReplyTo: r.auto_reply_to !== false,
          unsubscribeUrl: r.unsubscribe_url || "",
          enableOneClickUnsubscribe: r.enable_one_click_unsubscribe ?? true,
        });
      }
      if (method === "POST") {
        const { senderNames, subjects, bodyHtml, bodyText, attachments, trackOpens, trackClicks, replyTo, autoReplyTo, unsubscribeUrl, enableOneClickUnsubscribe } = body;
        const cleanReplyTo = replyTo !== undefined ? sanitizeReplyTo(replyTo) || "" : null;
        const cleanAutoReplyTo = autoReplyTo !== undefined ? Boolean(autoReplyTo) : true;
        const cleanUnsubUrl = unsubscribeUrl !== undefined ? sanitizeHeaderValue(unsubscribeUrl) : null;
        const cleanOneClick = enableOneClickUnsubscribe !== undefined ? Boolean(enableOneClickUnsubscribe) : true;

        await runQuery(
          env,
          `INSERT INTO neon_content (id, sender_names, subjects, body_html, body_text, attachments, track_opens, track_clicks, reply_to, auto_reply_to, unsubscribe_url, enable_one_click_unsubscribe, updated_at)
           VALUES ('default_content', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           ON CONFLICT (id) DO UPDATE SET
             sender_names = EXCLUDED.sender_names,
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
             updated_at = NOW();`,
          [
            JSON.stringify(senderNames || []),
            JSON.stringify(subjects || []),
            bodyHtml || "",
            bodyText || "",
            JSON.stringify(attachments || []),
            Boolean(trackOpens),
            Boolean(trackClicks),
            cleanReplyTo,
            cleanAutoReplyTo,
            cleanUnsubUrl,
            cleanOneClick,
          ],
        );
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // PRESETS MANAGEMENT (/api/presets)
    // -------------------------------------------------------------
    if (path === "/api/presets" || path.startsWith("/api/presets/")) {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_presets ORDER BY created_at DESC`,
        );
        const formatted = rows.map((r: any) => ({
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
        return jsonResponse(formatted);
      }
      if (method === "POST") {
        const { id, title, sender, subject, html, text, createdBy } = body;
        const presetId = id || `preset_${Date.now()}`;
        const presetTitle = title || "Untitled Preset";
        const presetSender = sender || "R Sender Support";
        const presetSubject = subject || "Update for {name}";
        const presetHtml = html || "";
        const presetText = text || "";
        const presetCreatedBy = createdBy || "user";

        const rows = await runQuery(
          env,
          `INSERT INTO neon_presets (id, title, sender, subject, html, text, created_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             sender = EXCLUDED.sender,
             subject = EXCLUDED.subject,
             html = EXCLUDED.html,
             text = EXCLUDED.text,
             updated_at = NOW()
           RETURNING *;`,
          [presetId, presetTitle, presetSender, presetSubject, presetHtml, presetText, presetCreatedBy],
        );
        const r = rows[0] || {};
        return jsonResponse({
          id: r.id || presetId,
          title: r.title || presetTitle,
          sender: r.sender || presetSender,
          subject: r.subject || presetSubject,
          html: r.html || presetHtml,
          text: r.text || presetText,
          createdBy: r.created_by || presetCreatedBy,
          createdAt: r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || new Date().toISOString(),
        });
      }
      if (method === "DELETE") {
        const id = path.replace("/api/presets/", "").trim();
        if (id) {
          await runQuery(env, `DELETE FROM neon_presets WHERE id = $1`, [id]);
        }
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // TASKS MANAGEMENT (/api/tasks)
    // -------------------------------------------------------------
    if (path === "/api/tasks") {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_tasks ORDER BY created_at DESC`,
        );
        return jsonResponse(
          rows.map((r: any) => ({
            id: r.id,
            userId: r.user_id || "",
            name: r.name,
            status: r.status || "idle",
            apiIds: safeJsonParse(r.api_ids || r.selected_api_ids, []),
            recipients: safeJsonParse(r.recipients, []),
            stats: safeJsonParse(r.stats, { total: 0, success: 0, failed: 0, remaining: 0 }),
            currentLog: r.current_log || "",
            progress: r.progress || 0,
            delayMs: r.delay_ms || 3000,
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
          })),
        );
      }
      if (method === "POST") {
        const t = body;
        const taskId = t.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const recipientsList = Array.isArray(t.recipients) ? t.recipients : [];
        const taskStats = t.stats || {
          total: recipientsList.length,
          success: 0,
          failed: 0,
          remaining: recipientsList.length,
        };
        const initialLog = t.currentLog || `Task created with ${recipientsList.length} recipients. Ready to run.`;
        const taskName = t.name || "Untitled Task";
        const delayMs = t.delayMs !== undefined ? t.delayMs : 3000;
        const apiIds = t.apiIds || t.selectedApiIds || [];
        const taskUserId = t.userId || "";
        const cleanTaskReplyTo = t.replyTo ? sanitizeReplyTo(t.replyTo) || "" : "";
        const cleanTaskUnsubUrl = t.unsubscribeUrl ? sanitizeHeaderValue(t.unsubscribeUrl) : "";
        const cleanTaskOneClick = t.enableOneClickUnsubscribe !== undefined ? Boolean(t.enableOneClickUnsubscribe) : true;

        await runQuery(
          env,
          `INSERT INTO neon_tasks (
             id, user_id, name, status, api_ids, recipients, stats, current_log, progress, delay_ms,
             sender_name, subject, body_html, body_text, attachments_count, reply_to, unsubscribe_url, enable_one_click_unsubscribe, created_at, started_at, completed_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), $19, $20)
           ON CONFLICT (id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             api_ids = EXCLUDED.api_ids,
             recipients = EXCLUDED.recipients,
             stats = EXCLUDED.stats,
             current_log = EXCLUDED.current_log,
             progress = EXCLUDED.progress,
             delay_ms = EXCLUDED.delay_ms,
             sender_name = EXCLUDED.sender_name,
             subject = EXCLUDED.subject,
             body_html = EXCLUDED.body_html,
             body_text = EXCLUDED.body_text,
             attachments_count = EXCLUDED.attachments_count,
             reply_to = COALESCE(EXCLUDED.reply_to, neon_tasks.reply_to),
             unsubscribe_url = COALESCE(EXCLUDED.unsubscribe_url, neon_tasks.unsubscribe_url),
             enable_one_click_unsubscribe = COALESCE(EXCLUDED.enable_one_click_unsubscribe, neon_tasks.enable_one_click_unsubscribe),
             started_at = EXCLUDED.started_at,
             completed_at = EXCLUDED.completed_at;`,
          [
            taskId,
            taskUserId,
            taskName,
            t.status || "idle",
            JSON.stringify(apiIds),
            JSON.stringify(recipientsList),
            JSON.stringify(taskStats),
            initialLog,
            t.progress || 0,
            delayMs,
            t.senderName || "",
            t.subject || "",
            t.bodyHtml || "",
            t.bodyText || "",
            t.attachmentsCount || 0,
            cleanTaskReplyTo,
            cleanTaskUnsubUrl,
            cleanTaskOneClick,
            t.startedAt || null,
            t.completedAt || null,
          ],
        );

        try {
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, timestamp, level, user_id, task_id, task_name, message, details)
             VALUES ($1, $2, 'info', $3, $4, $5, $6, $7);`,
            [
              logId,
              new Date().toLocaleTimeString(),
              taskUserId,
              taskId,
              taskName,
              `Created bulk task "${taskName}" with ${recipientsList.length} recipients in Neon DB`,
              JSON.stringify({ recipientsCount: recipientsList.length, apiCount: apiIds.length }),
            ],
          );
        } catch {}

        const returnedTask = {
          id: taskId,
          userId: taskUserId,
          name: taskName,
          status: t.status || "idle",
          apiIds,
          recipients: recipientsList,
          stats: taskStats,
          currentLog: initialLog,
          progress: t.progress || 0,
          delayMs,
          senderName: t.senderName || "",
          subject: t.subject || "",
          bodyHtml: t.bodyHtml || "",
          bodyText: t.bodyText || "",
          attachmentsCount: t.attachmentsCount || 0,
          createdAt: new Date().toISOString(),
          startedAt: t.startedAt || null,
          completedAt: t.completedAt || null,
        };

        return jsonResponse(returnedTask);
      }
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      if (method === "DELETE") {
        await runQuery(env, `DELETE FROM neon_tasks WHERE id = $1`, [taskId]);
        try {
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, timestamp, level, task_id, message)
             VALUES ($1, $2, 'warn', $3, $4);`,
            [logId, new Date().toLocaleTimeString(), taskId, `Deleted bulk task "${taskId}" from Neon DB`],
          );
        } catch {}
        return jsonResponse({ success: true });
      }
      if (method === "PATCH" || method === "PUT") {
        const t = body;
        const existing = await runQuery(
          env,
          `SELECT * FROM neon_tasks WHERE id = $1 LIMIT 1`,
          [taskId],
        );
        if (existing.length === 0) return errorResponse("Task not found", 404);
        const cur = existing[0];
        await runQuery(
          env,
          `UPDATE neon_tasks SET
             name = COALESCE($1, name),
             status = COALESCE($2, status),
             progress = COALESCE($3, progress),
             api_ids = COALESCE($4::jsonb, api_ids),
             recipients = COALESCE($5::jsonb, recipients),
             stats = COALESCE($6::jsonb, stats),
             current_log = COALESCE($7, current_log),
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
            t.name !== undefined ? t.name : null,
            t.status !== undefined ? t.status : null,
            t.progress !== undefined ? t.progress : null,
            t.apiIds !== undefined
              ? JSON.stringify(t.apiIds)
              : t.selectedApiIds !== undefined
              ? JSON.stringify(t.selectedApiIds)
              : null,
            t.recipients !== undefined ? JSON.stringify(t.recipients) : null,
            t.stats !== undefined ? JSON.stringify(t.stats) : null,
            t.currentLog !== undefined ? t.currentLog : null,
            t.delayMs !== undefined ? t.delayMs : null,
            t.senderName !== undefined ? t.senderName : null,
            t.subject !== undefined ? t.subject : null,
            t.bodyHtml !== undefined ? t.bodyHtml : null,
            t.bodyText !== undefined ? t.bodyText : null,
            t.attachmentsCount !== undefined ? t.attachmentsCount : null,
            t.startedAt !== undefined ? t.startedAt : null,
            t.completedAt !== undefined ? t.completedAt : null,
            taskId,
          ],
        );
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // AUDIT LOGS (/api/logs)
    // -------------------------------------------------------------
    if (path === "/api/logs") {
      if (method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "200", 10);
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_logs ORDER BY created_at DESC LIMIT $1`,
          [limit],
        );
        return jsonResponse(
          rows.map((r: any) => ({
            id: r.id,
            userId: r.user_id || undefined,
            timestamp: r.created_at,
            level: r.level,
            message: r.message,
            taskId: r.task_id,
            taskName: r.task_name,
            apiName: r.api_name,
            recipient: r.recipient,
            details: r.details,
          })),
        );
      }
      if (method === "POST") {
        const entry = body;
        const id =
          entry.id ||
          `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const timestamp =
          entry.timestamp || new Date().toLocaleTimeString();
        await runQuery(
          env,
          `INSERT INTO neon_logs (id, timestamp, level, user_id, message, task_id, task_name, api_name, recipient, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            id,
            timestamp,
            entry.level || "info",
            entry.userId || null,
            entry.message || "",
            entry.taskId || null,
            entry.taskName || null,
            entry.apiName || null,
            entry.recipient || null,
            JSON.stringify(entry.details || {}),
          ],
        );
        return jsonResponse({ success: true, id });
      }
      if (method === "DELETE") {
        await runQuery(env, `DELETE FROM neon_logs`);
        return jsonResponse({ success: true, message: "Logs purged" });
      }
    }

    // -------------------------------------------------------------
    // DOMAINS API
    // -------------------------------------------------------------
    if (path === "/api/domains") {
      if (method === "GET") {
        const currentHost = (
          request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
          request.headers.get("host")?.split(":")[0]?.trim() ||
          "localhost"
        ).toLowerCase();

        if (currentHost && currentHost !== "localhost" && !currentHost.startsWith("127.")) {
          const id = `dom_${currentHost.replace(/[^a-z0-9]/gi, "_")}`;
          const isCf = currentHost.includes("pages.dev");
          try {
            await runQuery(
              env,
              `INSERT INTO neon_domains (id, domain, source, domain_type, status, is_verified, request_count, last_active_at)
               VALUES ($1, $2, 'auto', $3, 'active', true, 1, CURRENT_TIMESTAMP)
               ON CONFLICT (domain) DO UPDATE
               SET request_count = neon_domains.request_count + 1,
                   last_active_at = CURRENT_TIMESTAMP`,
              [id, currentHost, isCf ? "cloudflare_pages" : "custom"]
            );
          } catch (e) {
            // ignore
          }
        }

        const rows = await runQuery(
          env,
          "SELECT id, domain, source, domain_type, status, is_verified, request_count, last_active_at, created_at FROM neon_domains ORDER BY last_active_at DESC"
        );

        const formatted = rows.map((r: any) => ({
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

        return jsonResponse({
          currentHost,
          domains: formatted,
        });
      }

      if (method === "POST") {
        const { domain, domainType, status } = body || {};
        if (!domain || !domain.trim()) {
          return jsonResponse({ error: "Domain hostname is required." }, 400);
        }

        const cleanDomain = domain.trim().replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
        const id = `dom_${cleanDomain.replace(/[^a-z0-9]/gi, "_")}`;
        const type = domainType || (cleanDomain.includes("pages.dev") ? "cloudflare_pages" : "custom");

        const rows = await runQuery(
          env,
          `INSERT INTO neon_domains (id, domain, source, domain_type, status, is_verified, request_count, last_active_at)
           VALUES ($1, $2, 'manual', $3, $4, true, 0, CURRENT_TIMESTAMP)
           ON CONFLICT (domain) DO UPDATE
           SET domain_type = EXCLUDED.domain_type,
               status = EXCLUDED.status,
               last_active_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [id, cleanDomain, type, status || "active"]
        );

        if (!rows || rows.length === 0) {
           return jsonResponse({ error: "Failed to create domain." }, 500);
        }

        const r = rows[0];
        return jsonResponse({
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
      }
    }

    if (path.startsWith("/api/domains/") && path.split("/").length === 4) {
      const id = path.split("/")[3];
      if (method === "PUT") {
        const { status, domainType, isVerified } = body || {};
        const rows = await runQuery(
          env,
          `UPDATE neon_domains
           SET status = COALESCE($1, status),
               domain_type = COALESCE($2, domain_type),
               is_verified = COALESCE($3, is_verified),
               last_active_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING *`,
          [status ?? null, domainType ?? null, isVerified ?? null, id]
        );

        if (!rows || rows.length === 0) {
          return jsonResponse({ error: "Domain not found." }, 404);
        }

        const r = rows[0];
        return jsonResponse({
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
      }

      if (method === "DELETE") {
        await runQuery(env, "DELETE FROM neon_domains WHERE id = $1", [id]);
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // SYSTEM SETTINGS (/api/settings)
    // -------------------------------------------------------------
    if (path === "/api/settings") {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_settings WHERE id = 'default_settings' LIMIT 1`,
        );
        if (rows.length === 0) {
          return jsonResponse({
            siteName: "R Sender",
            siteLogo: "",
            favicon: "✉️",
            supportEmail: "support@rsender.io",
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
        return jsonResponse({
          siteName: r.site_name || "R Sender",
          siteLogo: r.site_logo || "",
          favicon: r.favicon || "✉️",
          supportEmail: r.support_email || "support@rsender.io",
          maintenanceMode: r.maintenance_mode || false,
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
      }
      if (method === "POST") {
        const {
          siteName,
          siteLogo,
          favicon,
          supportEmail,
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
        } = body;
        await runQuery(
          env,
          `INSERT INTO neon_settings (
            id, site_name, site_logo, favicon, support_email, maintenance_mode,
            company_name, company_address, default_unsubscribe_url,
            enable_one_click_unsubscribe, enable_global_unsubscribe, enable_resend_tracking,
            enable_auto_reply_to, default_subject, enable_dynamic_tags, enable_deliverability_scanner,
            enable_attachments, enable_plain_text_fallback, updated_at
          )
           VALUES ('default_settings', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
           ON CONFLICT (id) DO UPDATE SET
             site_name = COALESCE(EXCLUDED.site_name, neon_settings.site_name),
             site_logo = COALESCE(EXCLUDED.site_logo, neon_settings.site_logo),
             favicon = COALESCE(EXCLUDED.favicon, neon_settings.favicon),
             support_email = COALESCE(EXCLUDED.support_email, neon_settings.support_email),
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
             updated_at = NOW();`,
          [
            siteName || "R Sender",
            siteLogo || "",
            favicon || "✉️",
            supportEmail || "support@rsender.io",
            maintenanceMode || false,
            companyName || "Your Company",
            companyAddress || "123 Business Rd, City, Country",
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
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // SUPABASE S3 STORAGE ENDPOINTS (/api/storage/*)
    // -------------------------------------------------------------
    if (path === "/api/storage/config") {
      if (method === "GET") {
        const rows = await runQuery(
          env,
          `SELECT * FROM neon_storage_config WHERE id = 'default_storage' LIMIT 1`,
        );
        if (rows.length === 0) {
          return jsonResponse({
            provider: "supabase_s3",
            endpoint: "",
            region: "us-east-1",
            bucket: "",
            accessKeyId: "",
            secretAccessKey: "",
            publicUrlBase: "",
            forcePathStyle: true,
            isEnabled: false,
            status: "unconfigured",
            hasSecret: false,
          });
        }
        const r = rows[0];
        const masked = r.secret_access_key
          ? "••••••••••••" + r.secret_access_key.slice(-4)
          : "";
        return jsonResponse({
          provider: r.provider,
          endpoint: r.endpoint,
          region: r.region,
          bucket: r.bucket,
          accessKeyId: r.access_key_id,
          secretAccessKey: masked,
          publicUrlBase: r.public_url_base,
          forcePathStyle: r.force_path_style,
          isEnabled: r.is_enabled,
          status: r.status,
          hasSecret: !!r.secret_access_key,
        });
      }
      if (method === "POST") {
        const cfg = body;
        const existing = await runQuery(
          env,
          `SELECT secret_access_key FROM neon_storage_config WHERE id = 'default_storage' LIMIT 1`,
        );
        const curSecret = existing[0]?.secret_access_key || "";

        const secretToSave =
          cfg.secretAccessKey === ""
            ? ""
            : cfg.secretAccessKey && !cfg.secretAccessKey.includes("•")
              ? cfg.secretAccessKey.trim()
              : curSecret;

        await runQuery(
          env,
          `INSERT INTO neon_storage_config (
             id, provider, endpoint, region, bucket, access_key_id, secret_access_key,
             public_url_base, force_path_style, is_enabled, status, updated_at
           ) VALUES ('default_storage', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (id) DO UPDATE SET
             provider = EXCLUDED.provider,
             endpoint = EXCLUDED.endpoint,
             region = EXCLUDED.region,
             bucket = EXCLUDED.bucket,
             access_key_id = EXCLUDED.access_key_id,
             secret_access_key = EXCLUDED.secret_access_key,
             public_url_base = EXCLUDED.public_url_base,
             force_path_style = EXCLUDED.force_path_style,
             is_enabled = EXCLUDED.is_enabled,
             status = EXCLUDED.status,
             updated_at = NOW();`,
          [
            cfg.provider || "supabase_s3",
            cfg.endpoint || "",
            cfg.region || "us-east-1",
            cfg.bucket || "",
            cfg.accessKeyId || "",
            secretToSave,
            cfg.publicUrlBase || "",
            cfg.forcePathStyle ?? true,
            cfg.isEnabled ?? false,
            cfg.status || "unconfigured",
          ],
        );
        const masked = secretToSave
          ? "••••••••••••" + secretToSave.slice(-4)
          : "";
        return jsonResponse({
          ...cfg,
          secretAccessKey: masked,
          hasSecret: !!secretToSave,
        });
      }
    }

    if (path === "/api/storage/test" && method === "POST") {
      const cfg = body;
      const endpoint = cfg.endpoint?.trim();
      const bucket = cfg.bucket?.trim();
      if (!endpoint)
        return errorResponse("Supabase S3 Endpoint URL is required", 400);
      if (!bucket) return errorResponse("Storage bucket name is required", 400);

      // Perform direct HTTP probe
      const start = Date.now();
      try {
        const probeRes = await fetch(
          `${endpoint.replace(/\/$/, "")}/${bucket}`,
          {
            method: "GET",
            headers: { "User-Agent": "CloudflarePages-RSender/1.0" },
          },
        );
        const latency = Date.now() - start;
        return jsonResponse({
          connected: probeRes.status < 500,
          pingMs: latency,
          bucket,
          endpoint,
          message:
            probeRes.status < 500
              ? "Supabase S3 storage endpoint reachable"
              : `HTTP ${probeRes.status}`,
        });
      } catch (err: any) {
        return errorResponse(err.message || "S3 probe failed", 400);
      }
    }

    if (path === "/api/storage/upload" && method === "POST") {
      const { fileName, base64Content, mimeType, source, uploadedBy } = body;
      if (!fileName || !base64Content)
        return errorResponse("fileName and base64Content required", 400);

      const cfgRows = await runQuery(
        env,
        `SELECT * FROM neon_storage_config WHERE id = 'default_storage' LIMIT 1`,
      );
      const cfg = cfgRows[0] || {};
      const bucket = (cfg.bucket || "").trim();

      let cleanBase64 = base64Content;
      if (cleanBase64.includes("base64,"))
        cleanBase64 = cleanBase64.split("base64,")[1];
      const binary = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));

      const fileId = `s3_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const s3Key = `${source || "uploads"}/${Date.now()}_${safeName}`;

      let publicUrl = "";
      if (cfg.public_url_base && cfg.public_url_base.trim()) {
        publicUrl = `${cfg.public_url_base.trim().replace(/\/$/, "")}/${s3Key}`;
      } else {
        let ep = (cfg.endpoint || "").trim().replace(/\/$/, "");
        if (!ep.startsWith("http://") && !ep.startsWith("https://")) {
          ep = `https://${ep}`;
        }
        if (ep.includes(".supabase.co")) {
          const root = ep.split("/storage/v1")[0];
          publicUrl = `${root}/storage/v1/object/public/${bucket}/${s3Key}`;
        } else {
          publicUrl = `${ep}/${bucket}/${s3Key}`;
        }
      }

      // Check if real S3 credentials exist to perform real upload
      const hasS3Config = Boolean(
        cfg.endpoint &&
        cfg.bucket &&
        cfg.access_key_id &&
        cfg.secret_access_key
      );

      if (hasS3Config) {
        try {
          let endpointUrl = cfg.endpoint.trim();
          if (!endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
            endpointUrl = `https://${endpointUrl}`;
          }
          const s3 = new S3Client({
            endpoint: endpointUrl,
            region: cfg.region || "us-east-1",
            credentials: {
              accessKeyId: cfg.access_key_id.trim(),
              secretAccessKey: cfg.secret_access_key.trim(),
            },
            forcePathStyle: cfg.force_path_style !== false,
          });

          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: s3Key,
              Body: binary,
              ContentType: mimeType || "application/octet-stream",
            })
          );
        } catch (s3Err: any) {
          console.error("[S3 Upload Failed]", s3Err);
          return errorResponse(
            `Supabase S3 upload failed: ${s3Err.message || s3Err}`,
            500
          );
        }
      } else {
        return errorResponse(
          "Supabase S3 storage is not configured. Please configure storage credentials in Admin Settings.",
          400
        );
      }

      await runQuery(
        env,
        `INSERT INTO neon_uploaded_files (id, file_name, file_size, mime_type, s3_key, s3_url, bucket, source, uploaded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          fileId,
          fileName,
          binary.length,
          mimeType || "application/octet-stream",
          s3Key,
          publicUrl,
          bucket,
          source || "attachment",
          uploadedBy || "system",
        ],
      );

      return jsonResponse({
        success: true,
        file: {
          id: fileId,
          fileName,
          fileSize: binary.length,
          mimeType: mimeType || "application/octet-stream",
          s3Key,
          s3Url: publicUrl,
          bucket,
          source: source || "attachment",
        },
      });
    }

    if (path === "/api/storage/files") {
      const rows = await runQuery(
        env,
        `SELECT * FROM neon_uploaded_files ORDER BY created_at DESC LIMIT 100`,
      );
      return jsonResponse({
        files: rows.map((r: any) => ({
          id: r.id,
          fileName: r.file_name,
          fileSize: r.file_size,
          mimeType: r.mime_type,
          s3Key: r.s3_key,
          s3Url: r.s3_url,
          bucket: r.bucket,
          source: r.source,
          uploadedBy: r.uploaded_by,
          createdAt: r.created_at,
        })),
      });
    }

    const fileDeleteMatch = path.match(/^\/api\/storage\/files\/([^/]+)$/);
    if (fileDeleteMatch && method === "DELETE") {
      const fileId = fileDeleteMatch[1];
      await runQuery(env, `DELETE FROM neon_uploaded_files WHERE id = $1`, [
        fileId,
      ]);
      return jsonResponse({ success: true });
    }

    if (path === "/api/storage/proxy" && method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return errorResponse("URL is required", 400);

      try {
        const fetchRes = await fetch(targetUrl);
        if (!fetchRes.ok) {
          return errorResponse(`Failed to fetch from S3: ${fetchRes.statusText}`, fetchRes.status);
        }
        
        const arrayBuffer = await fetchRes.arrayBuffer();
        const contentType = fetchRes.headers.get("content-type") || "application/octet-stream";
        
        return new Response(arrayBuffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err: any) {
        return errorResponse(`Proxy fetch failed: ${err.message}`, 500);
      }
    }

    // -------------------------------------------------------------
    // RESEND API TESTING & SENDING (/api/resend/*)
    // -------------------------------------------------------------
    if (path === "/api/resend/test" && method === "POST") {
      const { apiKey, fromEmail } = body;
      const key = apiKey || env.RESEND_API_KEY;
      if (!key) return errorResponse("Resend API key is required", 400);

      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data: any = await res.json();

      if (!res.ok) {
        return errorResponse(
          data.message || "Invalid API Key",
          res.status,
          data,
        );
      }

      const domains = data.data || [];
      const verified = domains
        .filter((d: any) => d.status === "verified")
        .map((d: any) => d.name);

      return jsonResponse({
        valid: true,
        status: "verified",
        domains: domains.map((d: any) => ({ name: d.name, status: d.status })),
        verifiedDomains: verified,
        defaultSender:
          verified.length > 0
            ? `updates@${verified[0]}`
            : (fromEmail && !fromEmail.includes("resend.dev") ? fromEmail : ""),
        message: `Successfully authenticated with Resend (${domains.length} domain${domains.length === 1 ? "" : "s"})`,
      });
    }

    if (path === "/api/resend/domains" && method === "POST") {
      const { apiKey } = body;
      const key = apiKey || env.RESEND_API_KEY;
      if (!key) return errorResponse("Resend API key is required", 400);

      try {
        const domainRes = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${String(key).trim()}` },
        });
        const data: any = await domainRes.json().catch(() => ({}));

        if (!domainRes.ok) {
          return jsonResponse({
            success: false,
            domains: [],
            message: data?.message || "Sending-only key or no domains configured",
          });
        }

        const list = Array.isArray(data?.data) ? data.data : [];
        return jsonResponse({
          success: true,
          domains: list.map((d: any) => ({ name: d.name, status: d.status })),
        });
      } catch (err: any) {
        return errorResponse(err.message || "Failed to contact Resend API", 500);
      }
    }

    if ((path === "/api/resend/send" || path === "/api/send") && method === "POST") {
      const {
        apiKey,
        key: directKey,
        from,
        to,
        subject,
        html,
        text,
        attachments,
        reply_to,
        replyTo,
        autoReplyTo,
        unsubscribeUrl,
        enableOneClickUnsubscribe,
        headers,
        cc,
        bcc,
        taskId,
        taskName,
        apiId,
        apiName,
        providerType,
        provider_type,
        open_tracking,
        openTracking,
        click_tracking,
        clickTracking,
        track_opens,
        trackOpens,
        track_clicks,
        trackClicks,
      } = body;

      const key = apiKey || directKey;
      const rawReplyTo = replyTo || reply_to;
      const plainText =
        text && typeof text === "string" && text.trim().length > 0
          ? text
          : (html && typeof html === "string" && html.trim().length > 0 ? htmlToPlainText(html) : undefined);

      const resolvedProvider =
        providerType || provider_type || (body.smtpHost || body.smtp_host ? "smtp" : "resend");

      if (resolvedProvider === "smtp") {
        const channel: EmailChannel = {
          id: apiId || "temp",
          name: apiName || "Custom SMTP",
          provider_type: "smtp",
          sender_email: String(from || body.smtpUser || body.smtp_user || "").trim(),
          smtp_host: body.smtpHost || body.smtp_host,
          smtp_port: body.smtpPort || body.smtp_port || 587,
          smtp_secure: body.smtpSecure !== undefined ? body.smtpSecure : body.smtp_secure,
          smtp_user: body.smtpUser || body.smtp_user,
          smtp_pass: body.smtpPass || body.smtp_pass,
        };

        const mailPayload = {
          from: String(from).trim(),
          to: Array.isArray(to) ? to : [to],
          subject: String(subject),
          html: html,
          text: plainText,
          reply_to: rawReplyTo,
          headers: headers && typeof headers === "object" ? headers : undefined,
        };

        const result = await sendWithSmtp(channel, mailPayload as any);

        if (!result.success) {
          try {
            await runQuery(
              env,
              `INSERT INTO neon_logs (id, level, message, task_id, task_name, api_name, recipient, details, created_at)
               VALUES ($1, 'error', $2, $3, $4, $5, $6, $7, NOW())`,
              [
                `log_${Date.now()}`,
                `Failed sending via SMTP to ${to}: ${result.error}`,
                taskId || null,
                taskName || null,
                apiName || null,
                Array.isArray(to) ? to.join(", ") : to,
                JSON.stringify(result),
              ],
            );
          } catch {}
          return errorResponse(result.error || "Failed to send email via SMTP", 500, result);
        }

        try {
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, level, message, task_id, task_name, api_name, recipient, details, created_at)
             VALUES ($1, 'success', $2, $3, $4, $5, $6, $7, NOW())`,
            [
              `log_${Date.now()}`,
              `Delivered via SMTP to ${Array.isArray(to) ? to.join(", ") : to} [ID: ${result.messageId}]`,
              taskId || null,
              taskName || null,
              apiName || null,
              Array.isArray(to) ? to.join(", ") : to,
              JSON.stringify({ id: result.messageId, provider: "smtp" }),
            ],
          );
        } catch {}

        return jsonResponse({
          success: true,
          id: result.messageId,
          message: "Email dispatched successfully via SMTP",
          provider: "smtp"
        });
      }

      if (!key) return errorResponse("Resend API key is required", 400);
      if (!to || !from || !subject)
        return errorResponse("From, to, and subject are required", 400);

      const cleanFrom = String(from).trim();
      if (!cleanFrom || cleanFrom.toLowerCase().includes("onboarding@resend.dev")) {
        return errorResponse(
          "DMARC Guard: 'onboarding@resend.dev' is not permitted for live dispatches to prevent DMARC alignment failure. A verified sender address on your custom domain is required.",
          400,
        );
      }

      const recipientList: string[] = Array.isArray(to) ? to : [to];
      const isAutoReplyTo = autoReplyTo !== false;

      // Query neon_settings for deliverability defaults
      let allowTracking = false;
      let defaultUnsubUrl: string | undefined;
      let enableGlobalUnsub = true;

      try {
        const settingsRows = await runQuery(
          env,
          `SELECT enable_resend_tracking, default_unsubscribe_url, enable_global_unsubscribe FROM neon_settings WHERE id = 'default_settings' LIMIT 1`,
        );
        if (settingsRows.length > 0) {
          allowTracking = settingsRows[0].enable_resend_tracking === true;
          defaultUnsubUrl = settingsRows[0].default_unsubscribe_url;
          enableGlobalUnsub = settingsRows[0].enable_global_unsubscribe !== false;
        }
      } catch {}

      const isRequestedOpen = Boolean(open_tracking ?? openTracking ?? track_opens ?? trackOpens);
      const isRequestedClick = Boolean(click_tracking ?? clickTracking ?? track_clicks ?? trackClicks);
      const openTrackingFinal = allowTracking && isRequestedOpen;
      const clickTrackingFinal = allowTracking && isRequestedClick;

      const payload: any = {
        from: cleanFrom,
        to: recipientList,
        subject,
        open_tracking: openTrackingFinal,
        click_tracking: clickTrackingFinal,
        ...(html ? { html } : {}),
        ...(plainText ? { text: plainText } : {}),
        ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
        ...(bcc ? { bcc: Array.isArray(bcc) ? bcc : [bcc] } : {}),
      };

      if (!payload.html && !payload.text) {
        return errorResponse("Email body is required. Both HTML and Plain-Text content are missing.", 400);
      }

      // RFC-8058 One-Click List-Unsubscribe Header Generation & Auto-Reply-To Resolution
      const requestOrigin = url.origin;
      const antiSpam = generateAntiSpamHeaders({
        fromEmail: from,
        recipientEmail: recipientList[0] || "",
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
        payload.reply_to = antiSpam.replyTo;
      }

      if (antiSpam.headers && Object.keys(antiSpam.headers).length > 0) {
        payload.headers = antiSpam.headers;
      }

      if (attachments && attachments.length > 0) {
        payload.attachments = attachments.map((a: any) => ({
          filename: a.filename || a.name || "attachment",
          content: a.content || "",
        }));
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resData: any = await res.json();

      if (!res.ok) {
        // Log failure to neon_logs
        try {
          await runQuery(
            env,
            `INSERT INTO neon_logs (id, level, message, task_id, task_name, api_name, recipient, details, created_at)
             VALUES ($1, 'error', $2, $3, $4, $5, $6, $7, NOW())`,
            [
              `log_${Date.now()}`,
              `Failed sending to ${to}: ${resData.message || "Resend error"}`,
              taskId || null,
              taskName || null,
              apiName || null,
              Array.isArray(to) ? to.join(", ") : to,
              JSON.stringify(resData),
            ],
          );
        } catch {}

        return errorResponse(
          resData.message || "Failed to send email",
          res.status,
          resData,
        );
      }

      // Log success to neon_logs
      try {
        await runQuery(
          env,
          `INSERT INTO neon_logs (id, level, message, task_id, task_name, api_name, recipient, details, created_at)
           VALUES ($1, 'success', $2, $3, $4, $5, $6, $7, NOW())`,
          [
            `log_${Date.now()}`,
            `Delivered to ${Array.isArray(to) ? to.join(", ") : to} [ID: ${resData.id}]${payload.reply_to ? ` [Reply-To: ${payload.reply_to}]` : ""}`,
            taskId || null,
            taskName || null,
            apiName || null,
            Array.isArray(to) ? to.join(", ") : to,
            JSON.stringify({ id: resData.id, replyTo: payload.reply_to, hasUnsubscribeHeader: !!payload.headers?.["List-Unsubscribe"] }),
          ],
        );
      } catch {}

      return jsonResponse({
        success: true,
        id: resData.id,
        replyTo: payload.reply_to,
        message: "Email dispatched successfully",
      });
    }

    if (method === "POST" && path === "/api/smtp/verify") {
      const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = body;
      const channel: EmailChannel = {
        id: "verify",
        name: "verify",
        provider_type: "smtp",
        sender_email: String(smtpUser || body.user || "").trim(),
        smtp_host: smtpHost || body.host,
        smtp_port: smtpPort || body.port,
        smtp_secure: smtpSecure !== undefined ? smtpSecure : body.secure,
        smtp_user: smtpUser || body.user,
        smtp_pass: smtpPass || body.pass,
      };
      
      const result = await verifySmtp(channel);
      if (result.success) {
        return jsonResponse({ success: true, message: "SMTP configuration is valid" });
      } else {
        return errorResponse(result.error || "Failed to verify SMTP configuration", 400);
      }
    }


    // 404 For Unmatched API Routes
    return errorResponse(`API endpoint not found: ${method} ${path}`, 404);
  } catch (err: any) {
    console.error(`[Cloudflare Pages Error] ${method} ${path}:`, err);
    return errorResponse(err.message || "Internal Server Error", 500);
  }
}
