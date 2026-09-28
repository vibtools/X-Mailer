/**
 * Nodemailer Custom SMTP Provider Adapter with High-Speed Connection Pooling
 */

import crypto from "node:crypto";
import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { EmailChannel, EmailPayload, SendResult, VerifyResult } from "./types";

/**
 * Extracts clean domain from sender string (e.g. "Acme <billing@acme.com>" -> "acme.com")
 */
export function extractSenderDomain(from?: string): string | undefined {
  if (!from || typeof from !== "string") return undefined;
  const match = from.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Generates an RFC 5322 compliant Message-ID using the sender's authenticated domain.
 * Format: <timestamp.pid.randomBytes@senderDomain>
 * Prevents container/cloud hostname leaks and eliminates SpamAssassin MSGID penalties.
 */
export function generateRfc5322MessageId(from?: string, fallbackHost?: string): string {
  const domain = extractSenderDomain(from) || fallbackHost || "smtp.local";
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(8).toString("hex");
  const pid = process.pid ? process.pid.toString(36) : "1";
  return `<${timestamp}.${pid}.${randomHex}@${domain}>`;
}

// Persistent connection pool cache to eliminate TCP/TLS handshake latency in bulk dispatches
const transporterPool = new Map<string, Transporter>();

function getPoolKey(channel: EmailChannel): string {
  return `${channel.id || "temp"}_${channel.smtp_host}_${channel.smtp_port}_${channel.smtp_user}`;
}

export function createTransporter(channel: EmailChannel, pooled = true): Transporter {
  const port = Number(channel.smtp_port) || 587;
  const isSecure = channel.smtp_secure !== undefined ? Boolean(channel.smtp_secure) : port === 465;

  // TLS Configuration: Strict RFC/MTA-STS TLS certificate validation by default
  // Allows optional override via channel.smtp_tls_reject_unauthorized (or NODE_TLS_REJECT_UNAUTHORIZED)
  const isLocalHost = channel.smtp_host?.trim() === "localhost" || channel.smtp_host?.trim() === "127.0.0.1";
  const rejectUnauthorized = channel.smtp_tls_reject_unauthorized !== undefined
    ? Boolean(channel.smtp_tls_reject_unauthorized)
    : !isLocalHost;

  const host = channel.smtp_host?.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user: channel.smtp_user?.trim(),
      pass: channel.smtp_pass || "",
    },
    pool: pooled,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized,
      minVersion: "TLSv1.2",
      servername: host,
    },
  });
}

export function getOrCreateTransporter(channel: EmailChannel): Transporter {
  const key = getPoolKey(channel);
  let transporter = transporterPool.get(key);

  if (!transporter) {
    transporter = createTransporter(channel, true);
    transporterPool.set(key, transporter);
  }

  return transporter;
}

export function invalidateTransporter(channelId: string): void {
  for (const [key, transporter] of transporterPool.entries()) {
    if (key.startsWith(channelId)) {
      try {
        transporter.close();
      } catch {}
      transporterPool.delete(key);
    }
  }
}

export async function sendWithSmtp(
  channel: EmailChannel,
  payload: EmailPayload
): Promise<SendResult> {
  if (!channel.smtp_host || !channel.smtp_user) {
    return {
      success: false,
      provider: "smtp",
      error: "Missing required SMTP host or username for channel: " + channel.name,
    };
  }

  try {
    const transporter = getOrCreateTransporter(channel);

    const customMessageId = generateRfc5322MessageId(payload.from, channel.smtp_host);

    const mailOptions: SendMailOptions = {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html || undefined,
      text: payload.text || undefined,
      headers: payload.headers || undefined,
      replyTo: payload.reply_to || undefined,
      messageId: customMessageId,
    };

    if (payload.attachments && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map((att) => ({
        filename: att.filename,
        content: att.content ? Buffer.from(att.content.replace(/^data:.*?;base64,/, ''), "base64") : undefined,
        path: att.path || undefined,
        contentType: att.contentType,
      }));
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      provider: "smtp",
      details: {
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      },
    };
  } catch (err: any) {
    // If connection was dropped, clear cached transporter so next attempt creates a fresh socket
    invalidateTransporter(channel.id);

    return {
      success: false,
      provider: "smtp",
      error: err.message || "Failed to dispatch email via SMTP server",
      code: err.code || "SMTP_SEND_FAILED",
      details: {
        errorMsg: err.message,
        code: err.code,
        syscall: err.syscall,
        hostname: err.hostname,
        command: err.command,
        responseCode: err.responseCode,
        response: err.response,
      },
    };
  }
}

export async function verifySmtp(channel: EmailChannel): Promise<VerifyResult> {
  if (!channel.smtp_host || !channel.smtp_user) {
    return {
      success: false,
      message: "SMTP Host and Username are required for verification",
      error: "MISSING_CONFIG",
    };
  }

  const host = channel.smtp_host.trim();
  const port = Number(channel.smtp_port) || 587;
  const isSecure = channel.smtp_secure !== undefined ? Boolean(channel.smtp_secure) : port === 465;

  // TLS Configuration: Strict RFC/MTA-STS TLS certificate validation by default
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const rejectUnauthorized = channel.smtp_tls_reject_unauthorized !== undefined
    ? Boolean(channel.smtp_tls_reject_unauthorized)
    : !isLocalHost;

  // Detailed forensic logger for connection issues
  const debugLogs: string[] = [];
  const customLogger = {
    level: () => {},
    trace: (...args: any[]) => debugLogs.push(`[TRACE] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    debug: (...args: any[]) => debugLogs.push(`[DEBUG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    info: (...args: any[]) => debugLogs.push(`[INFO]  ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    warn: (...args: any[]) => debugLogs.push(`[WARN]  ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    error: (...args: any[]) => debugLogs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
    fatal: (...args: any[]) => debugLogs.push(`[FATAL] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`),
  };

  // For testing, use non-pooled standalone verification transporter with explicit SNI & robust timeouts
  const testTransporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user: channel.smtp_user.trim(),
      pass: channel.smtp_pass || "",
    },
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    tls: {
      rejectUnauthorized,
      minVersion: "TLSv1.2",
      servername: host,
    },
    debug: true,
    logger: customLogger as any,
  });

  try {
    await testTransporter.verify();
    testTransporter.close();

    return {
      success: true,
      message: `SMTP Handshake & Authentication Successful! Connected to ${host}:${port} (${isSecure ? "SSL / SMTPS" : "STARTTLS"}).`,
    };
  } catch (err: any) {
    try {
      testTransporter.close();
    } catch {}

    let detailedMsg = err.message || "Unknown SMTP handshake failure";
    if (err.code === "EAUTH" || err.responseCode === 535 || (typeof err.message === "string" && err.message.includes("535"))) {
      detailedMsg = "Authentication failed: Invalid SMTP username or password. For Zoho, Gmail, Outlook, or Yahoo, you must generate and use an App Password instead of your primary account password.";
    } else if (err.code === "ESOCKET" || err.code === "ETIMEDOUT") {
      detailedMsg = `Connection timed out connecting to ${host}:${port}. Verify hostname, port, and security (${isSecure ? "Port 465 with SSL" : "Port 587 with STARTTLS"}).`;
    } else if (err.code === "ECONNREFUSED") {
      detailedMsg = `Connection refused at ${host}:${port}. Ensure the SMTP server is reachable and not blocked by network firewall.`;
    } else if (err.code === "EENVELOPE") {
      detailedMsg = `Envelope sender rejected by SMTP server: ${err.message}`;
    }

    return {
      success: false,
      message: detailedMsg,
      error: err.code || "SMTP_VERIFY_ERROR",
      details: {
        errorMsg: err.message,
        code: err.code,
        syscall: err.syscall,
        hostname: err.hostname,
        response: err.response,
        responseCode: err.responseCode,
        protocolLogs: debugLogs.length > 0 ? debugLogs : [`[ERROR] ${err.message || 'Connection failed'}`],
      },
    };
  }
}

