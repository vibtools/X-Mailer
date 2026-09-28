/**
 * API Service Layer for R Sender
 * Connects directly to Backend Express API & Neon PostgreSQL Database
 * Cloudflare Pages & Edge runtime resilient with safe JSON and HTML-error interceptors
 */

import {
  AppUser,
  EmailContent,
  EmailPreset,
  LogEntry,
  RegisteredDomain,
  ResendApiKey,
  SupabaseStorageConfig,
  SystemSettings,
  TaskItem,
  UploadedFileRecord,
} from "../types";

export interface ResendTestResult {
  valid: boolean;
  status?: string;
  accessType?: "full" | "sending_only";
  domains?: Array<{ name: string; status: string }>;
  verifiedDomains?: string[];
  defaultSender?: string;
  message: string;
  error?: string;
  details?: any;
}

export interface SendEmailPayload {
  apiKey?: string;
  key?: string;
  apiId?: string;
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  reply_to?: string;
  autoReplyTo?: boolean;
  unsubscribeUrl?: string;
  enableOneClickUnsubscribe?: boolean;
  attachments?: Array<{ filename?: string; name?: string; content: string }>;
  headers?: Record<string, string>;
  taskId?: string;
  taskName?: string;
  apiName?: string;

  // Custom SMTP Channel fields
  providerType?: "resend" | "smtp" | "zoho";
  provider_type?: "resend" | "smtp" | "zoho";
  smtpHost?: string;
  smtp_host?: string;
  smtpPort?: number;
  smtp_port?: number;
  smtpSecure?: boolean;
  smtp_secure?: boolean;
  smtpUser?: string;
  smtp_user?: string;
  smtpPass?: string;
  smtp_pass?: string;

  // Zoho Mail API Channel fields
  zohoClientId?: string;
  zoho_client_id?: string;
  zohoClientSecret?: string;
  zoho_client_secret?: string;
  zohoRefreshToken?: string;
  zoho_refresh_token?: string;
  zohoAccountId?: string;
  zoho_account_id?: string;
  zohoRegion?: string;
  zoho_region?: string;

  // Anti-phishing & Tracking flags
  trackOpens?: boolean;
  trackClicks?: boolean;
  open_tracking?: boolean;
  click_tracking?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  message?: string;
  error?: string;
  simulated?: boolean;
  provider?: "resend" | "smtp" | "zoho";
}

export interface NeonHealthResponse {
  connected: boolean;
  endpoint: string;
  database: string;
  user: string;
  pgVersion: string;
  counts: {
    apis: number;
    users: number;
    tasks: number;
    logs: number;
  };
}

// -------------------------------------------------------------
// CORE SAFE FETCH UTILITY
// Intercepts HTML error responses (Cloudflare 404, 500, 502) before JSON parsing
// to eliminate "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" errors
// -------------------------------------------------------------
async function safeJsonFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit,
  endpointLabel = "API"
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  try {
    const res = await fetch(input, init);
    const text = await res.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response (e.g. HTML 404 / 500 / 502 page from Cloudflare or static SPA fallback)
      if (text.includes("<!DOCTYPE") || text.includes("<html") || text.startsWith("<")) {
        const errorMsg =
          res.status === 404
            ? `Cloudflare Pages function ${endpointLabel} not found (404). Ensure Functions are built and deployed.`
            : `Cloudflare Server Error (${res.status}) on ${endpointLabel}: Database connection failed. Verify DATABASE_URL in Cloudflare Pages Settings.`;
        return { ok: false, status: res.status, data: null as any, error: errorMsg };
      }
      return {
        ok: false,
        status: res.status,
        data: null as any,
        error: `Unexpected server response format (${res.status})`,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.error || data?.message || `Request failed with status ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null as any,
      error: err?.message || "Network request failed",
    };
  }
}

// -------------------------------------------------------------
// NEON DATABASE STATUS
// -------------------------------------------------------------
export async function getNeonHealth(): Promise<NeonHealthResponse> {
  const result = await safeJsonFetch<NeonHealthResponse>("/api/neon/health", undefined, "/api/neon/health");
  if (!result.ok || !result.data) {
    return {
      connected: false,
      endpoint: "Disconnected",
      database: "unknown",
      user: "unknown",
      pgVersion: "PostgreSQL",
      counts: { apis: 0, users: 0, tasks: 0, logs: 0 },
    };
  }
  return result.data;
}

export async function testNeonPostgres(connectionString?: string): Promise<{
  connected: boolean;
  message: string;
  endpoint?: string;
  database?: string;
  user?: string;
  pingMs?: number;
}> {
  const result = await safeJsonFetch<{
    connected?: boolean;
    message?: string;
    error?: string;
    endpoint?: string;
    database?: string;
    user?: string;
    pingMs?: number;
  }>(
    "/api/neon/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionString:
          connectionString && connectionString.trim()
            ? connectionString.trim()
            : undefined,
      }),
    },
    "/api/neon/test"
  );

  if (!result.ok) {
    return {
      connected: false,
      message: result.error || "Connection test failed",
    };
  }

  const data = result.data || {};
  return {
    connected: data.connected === true,
    message:
      data.message ||
      data.error ||
      (data.connected ? "Connected successfully" : "Connection failed"),
    endpoint: data.endpoint,
    database: data.database,
    user: data.user,
    pingMs: data.pingMs,
  };
}

// -------------------------------------------------------------
// APIS CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchApisFromDb(userId?: string): Promise<ResendApiKey[]> {
  const url = userId ? `/api/apis?userId=${encodeURIComponent(userId)}` : "/api/apis";
  const result = await safeJsonFetch<any>(url, undefined, "/api/apis");
  if (!result.ok || !result.data) return [];
  const rawList = Array.isArray(result.data) ? result.data : (result.data.apis || []);
  return rawList.map((r: any) => ({
    id: r.id,
    userId: r.userId || r.user_id || "",
    name: r.name || "Unnamed Channel",
    key: r.key || "",
    senderEmail: r.senderEmail || r.sender_email || "",
    dailyLimit: Number(r.dailyLimit ?? r.daily_limit) || 1000,
    usedToday: Number(r.usedToday ?? r.used_today) || 0,
    status: r.status || "active",
    lastTested: r.lastTested || r.last_tested || "",
    testStatusMsg: r.testStatusMsg || r.test_status_msg || "",
    providerType: r.providerType || r.provider_type || "resend",
    provider_type: r.provider_type || r.providerType || "resend",
    smtpHost: r.smtpHost || r.smtp_host || "",
    smtp_host: r.smtp_host || r.smtpHost || "",
    smtpPort: Number(r.smtpPort ?? r.smtp_port) || 587,
    smtp_port: Number(r.smtp_port ?? r.smtpPort) || 587,
    smtpSecure: Boolean(r.smtpSecure ?? r.smtp_secure),
    smtp_secure: Boolean(r.smtp_secure ?? r.smtpSecure),
    smtpUser: r.smtpUser || r.smtp_user || "",
    smtp_user: r.smtp_user || r.smtpUser || "",
    smtpPass: r.smtpPass || r.smtp_pass || "",
    smtp_pass: r.smtp_pass || r.smtpPass || "",
    zohoClientId: r.zohoClientId || r.zoho_client_id || "",
    zoho_client_id: r.zoho_client_id || r.zohoClientId || "",
    zohoClientSecret: r.zohoClientSecret || r.zoho_client_secret || "",
    zoho_client_secret: r.zoho_client_secret || r.zohoClientSecret || "",
    zohoRefreshToken: r.zohoRefreshToken || r.zoho_refresh_token || "",
    zoho_refresh_token: r.zoho_refresh_token || r.zohoRefreshToken || "",
    zohoAccountId: r.zohoAccountId || r.zoho_account_id || "",
    zoho_account_id: r.zoho_account_id || r.zohoAccountId || "",
    zohoRegion: r.zohoRegion || r.zoho_region || "com",
    zoho_region: r.zoho_region || r.zohoRegion || "com",
    createdAt: r.createdAt || r.created_at || "",
  }));
}

export async function createApiInDb(api: Partial<ResendApiKey>): Promise<ResendApiKey> {
  const result = await safeJsonFetch<any>(
    "/api/apis",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(api),
    },
    "/api/apis"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to create channel in database");
  }
  const r = result.data;
  return {
    id: r.id,
    userId: r.userId || r.user_id || "",
    name: r.name || api.name || "Unnamed Channel",
    key: r.key || api.key || "",
    senderEmail: r.senderEmail || r.sender_email || api.senderEmail || "",
    dailyLimit: Number(r.dailyLimit ?? r.daily_limit ?? api.dailyLimit) || 1000,
    usedToday: Number(r.usedToday ?? r.used_today ?? api.usedToday) || 0,
    status: r.status || api.status || "active",
    lastTested: r.lastTested || r.last_tested || api.lastTested || "Just now",
    testStatusMsg: r.testStatusMsg || r.test_status_msg || api.testStatusMsg || "",
    providerType: r.providerType || r.provider_type || api.providerType || "resend",
    provider_type: r.provider_type || r.providerType || api.provider_type || "resend",
    smtpHost: r.smtpHost || r.smtp_host || api.smtpHost || "",
    smtp_host: r.smtp_host || r.smtpHost || api.smtp_host || "",
    smtpPort: Number(r.smtpPort ?? r.smtp_port ?? api.smtpPort) || 587,
    smtp_port: Number(r.smtp_port ?? r.smtpPort ?? api.smtp_port) || 587,
    smtpSecure: Boolean(r.smtpSecure ?? r.smtp_secure ?? api.smtpSecure),
    smtp_secure: Boolean(r.smtp_secure ?? r.smtpSecure ?? api.smtp_secure),
    smtpUser: r.smtpUser || r.smtp_user || api.smtpUser || "",
    smtp_user: r.smtp_user || r.smtpUser || api.smtp_user || "",
    smtpPass: r.smtpPass || r.smtp_pass || api.smtpPass || "",
    smtp_pass: r.smtp_pass || r.smtpPass || api.smtp_pass || "",
    zohoClientId: r.zohoClientId || r.zoho_client_id || api.zohoClientId || api.zoho_client_id || "",
    zoho_client_id: r.zoho_client_id || r.zohoClientId || api.zoho_client_id || api.zohoClientId || "",
    zohoClientSecret: r.zohoClientSecret || r.zoho_client_secret || api.zohoClientSecret || api.zoho_client_secret || "",
    zoho_client_secret: r.zoho_client_secret || r.zohoClientSecret || api.zoho_client_secret || api.zohoClientSecret || "",
    zohoRefreshToken: r.zohoRefreshToken || r.zoho_refresh_token || api.zohoRefreshToken || api.zoho_refresh_token || "",
    zoho_refresh_token: r.zoho_refresh_token || r.zohoRefreshToken || api.zoho_refresh_token || api.zohoRefreshToken || "",
    zohoAccountId: r.zohoAccountId || r.zoho_account_id || api.zohoAccountId || api.zoho_account_id || "",
    zoho_account_id: r.zoho_account_id || r.zohoAccountId || api.zoho_account_id || api.zohoAccountId || "",
    zohoRegion: r.zohoRegion || r.zoho_region || api.zohoRegion || api.zoho_region || "com",
    zoho_region: r.zoho_region || r.zohoRegion || api.zoho_region || api.zohoRegion || "com",
    createdAt: r.createdAt || r.created_at || new Date().toISOString().split("T")[0],
  };
}

export async function verifySmtpChannelApi(config: {
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPass?: string;
  senderEmail?: string;
}): Promise<{ success: boolean; message: string; error?: string; details?: any }> {
  const result = await safeJsonFetch<any>(
    "/api/smtp/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
    "/api/smtp/verify"
  );
  if (!result.data) {
    return {
      success: false,
      message: result.error || "Failed to reach SMTP verification endpoint",
      error: result.error,
      details: null,
    };
  }
  const data = result.data;
  return {
    success: data.success === true,
    message: data.message || (data.success ? "SMTP connection successful" : (data.error || result.error || "SMTP verification failed")),
    error: data.error || (data.success ? undefined : result.error),
    details: data.details || (data.error || result.error ? { errorMsg: data.error || result.error } : null),
  };
}

export async function verifyZohoChannelApi(config: {
  zohoClientId: string;
  zohoClientSecret: string;
  zohoRefreshToken: string;
  zohoAccountId?: string;
  zohoRegion?: string;
  senderEmail?: string;
}): Promise<{ success: boolean; message: string; error?: string; details?: any }> {
  const result = await safeJsonFetch<any>(
    "/api/zoho/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
    "/api/zoho/verify"
  );
  if (!result.data) {
    return {
      success: false,
      message: result.error || "Failed to reach Zoho verification endpoint",
      error: result.error,
      details: null,
    };
  }
  const data = result.data;
  return {
    success: data.success === true,
    message: data.message || (data.success ? "Zoho Mail connection successful" : (data.error || result.error || "Zoho verification failed")),
    error: data.error || (data.success ? undefined : result.error),
    details: data.details || (data.error || result.error ? { errorMsg: data.error || result.error } : null),
  };
}

export async function exchangeZohoAuthCode(payload: {
  clientId: string;
  clientSecret: string;
  code: string;
  region?: string;
  redirectUri: string;
}): Promise<{
  success: boolean;
  refreshToken?: string;
  accessToken?: string;
  accountId?: string;
  primaryEmail?: string;
  verifiedEmails?: string[];
  region?: string;
  error?: string;
  message?: string;
}> {
  const result = await safeJsonFetch<any>(
    "/api/zoho/oauth/exchange",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "/api/zoho/oauth/exchange"
  );

  if (!result.data) {
    return {
      success: false,
      error: result.error || "Failed to reach Zoho token exchange endpoint",
      message: result.error || "Zoho OAuth exchange failed",
    };
  }

  const data = result.data;
  return {
    success: data.success === true,
    refreshToken: data.refreshToken,
    accessToken: data.accessToken,
    accountId: data.accountId,
    primaryEmail: data.primaryEmail,
    verifiedEmails: data.verifiedEmails || [],
    region: data.region,
    error: data.error,
    message:
      data.message ||
      (data.success
        ? "Zoho OAuth authorization successful"
        : data.error || "OAuth token exchange failed"),
  };
}


export async function updateApiInDb(
  id: string,
  partial: Partial<ResendApiKey>
): Promise<any> {
  const result = await safeJsonFetch<any>(
    `/api/apis/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    },
    `/api/apis/${id}`
  );
  if (!result.ok) {
    throw new Error(result.error || "Failed to update API in database");
  }
  return result.data;
}

export async function deleteApiFromDb(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/apis/${id}`,
    { method: "DELETE" },
    `/api/apis/${id}`
  );
  return result.ok;
}

// -------------------------------------------------------------
// CONTENT / TEMPLATES CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchContentFromDb(): Promise<EmailContent> {
  const defaultContent: EmailContent = {
    senderNames: ["Support Team"],
    subjects: ["Update for {name}"],
    bodyHtml: "<p>Hello {name}</p>",
    bodyText: "Hello {name}",
    attachments: [],
    trackOpens: false,
    trackClicks: false,
    autoReplyTo: true,
  };
  const result = await safeJsonFetch<EmailContent>("/api/content", undefined, "/api/content");
  if (!result.ok || !result.data) return defaultContent;
  return result.data;
}

export function sanitizeContentAttachmentsForDb(content: EmailContent): EmailContent {
  return {
    ...content,
    attachments: (content.attachments || []).map((att) => ({
      id: att.id,
      name: att.name,
      size: att.size,
      type: att.type,
      url: att.url,
      s3Key: att.s3Key,
      uploadedAt: att.uploadedAt,
    })),
  };
}

export async function saveContentToDb(content: EmailContent): Promise<boolean> {
  const sanitized = sanitizeContentAttachmentsForDb(content);
  const result = await safeJsonFetch<any>(
    "/api/content",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitized),
    },
    "/api/content"
  );
  return result.ok;
}

// -------------------------------------------------------------
// PRESETS / TEMPLATES CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchPresetsFromDb(): Promise<EmailPreset[]> {
  const result = await safeJsonFetch<EmailPreset[]>("/api/presets", undefined, "/api/presets");
  if (!result.ok || !result.data) return [];
  return Array.isArray(result.data) ? result.data : [];
}

export async function savePresetToDb(preset: Partial<EmailPreset>): Promise<EmailPreset | null> {
  const result = await safeJsonFetch<EmailPreset>(
    "/api/presets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    },
    "/api/presets"
  );
  if (!result.ok || !result.data) return null;
  return result.data;
}

export async function deletePresetFromDb(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/presets/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    `/api/presets/${encodeURIComponent(id)}`
  );
  return result.ok;
}

// -------------------------------------------------------------
// TASKS CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchTasksFromDb(): Promise<TaskItem[]> {
  const result = await safeJsonFetch<any>("/api/tasks", undefined, "/api/tasks");
  if (!result.ok || !result.data) return [];
  return Array.isArray(result.data) ? result.data : (result.data.tasks || []);
}

export async function createTaskInDb(task: Partial<TaskItem>): Promise<TaskItem> {
  const result = await safeJsonFetch<any>(
    "/api/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
    "/api/tasks"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to create task in database");
  }
  const d = result.data;
  const recipients = Array.isArray(d.recipients)
    ? d.recipients
    : Array.isArray(task.recipients)
    ? task.recipients
    : [];
  const stats = d.stats && typeof d.stats.total === "number"
    ? d.stats
    : task.stats && typeof task.stats.total === "number"
    ? task.stats
    : {
        total: recipients.length,
        success: 0,
        failed: 0,
        remaining: recipients.length,
      };

  return {
    id: d.id || task.id || `task_${Date.now()}`,
    name: d.name || task.name || "Untitled Task",
    status: d.status || task.status || "idle",
    apiIds: Array.isArray(d.apiIds) ? d.apiIds : (task.apiIds || []),
    recipients,
    stats,
    currentLog: d.currentLog || task.currentLog || `Task created with ${recipients.length} recipients. Ready to run.`,
    progress: d.progress ?? task.progress ?? 0,
    delayMs: d.delayMs ?? task.delayMs ?? 3000,
    senderName: d.senderName || task.senderName || "",
    subject: d.subject || task.subject || "",
    bodyHtml: d.bodyHtml || task.bodyHtml || "",
    bodyText: d.bodyText || task.bodyText || "",
    attachmentsCount: d.attachmentsCount ?? task.attachmentsCount ?? 0,
    createdAt: d.createdAt || task.createdAt || new Date().toISOString(),
    startedAt: d.startedAt || task.startedAt,
    completedAt: d.completedAt || task.completedAt,
  };
}

export async function updateTaskInDb(
  id: string,
  partial: Partial<TaskItem>
): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/tasks/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    },
    `/api/tasks/${id}`
  );
  return result.ok;
}

export async function deleteTaskFromDb(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/tasks/${id}`,
    { method: "DELETE" },
    `/api/tasks/${id}`
  );
  return result.ok;
}

// -------------------------------------------------------------
// USERS CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchUsersFromDb(): Promise<AppUser[]> {
  const result = await safeJsonFetch<any>("/api/users", undefined, "/api/users");
  if (!result.ok || !result.data) return [];
  const list = Array.isArray(result.data) ? result.data : (result.data.users || []);
  return list.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    dailyLimit: Number(u.dailyLimit ?? u.daily_limit) || 5000,
    usedToday: Number(u.usedToday ?? u.used_today) || 0,
    lastLogin: u.lastLogin || u.last_login || "Never",
    allowedDomains: Array.isArray(u.allowedDomains) ? u.allowedDomains : Array.isArray(u.allowed_domains) ? u.allowed_domains : [],
    createdAt: u.createdAt || u.created_at || "",
  }));
}

export async function createUserInDb(user: Partial<AppUser>): Promise<AppUser> {
  const result = await safeJsonFetch<AppUser>(
    "/api/users",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    },
    "/api/users"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to create user in database");
  }
  return result.data;
}

export async function updateUserInDb(
  id: string,
  partial: Partial<AppUser>
): Promise<any> {
  const result = await safeJsonFetch<any>(
    `/api/users/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    },
    `/api/users/${id}`
  );
  if (!result.ok) {
    throw new Error(result.error || "Failed to update user in database");
  }
  return result.data;
}

export async function deleteUserFromDb(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/users/${id}`,
    { method: "DELETE" },
    `/api/users/${id}`
  );
  return result.ok;
}

// -------------------------------------------------------------
// DOMAINS & MULTI-TENANCY ANALYSIS (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchDomainsFromDb(): Promise<{ currentHost: string; domains: RegisteredDomain[] }> {
  const result = await safeJsonFetch<{ currentHost: string; domains: RegisteredDomain[] }>(
    "/api/domains",
    undefined,
    "/api/domains"
  );
  if (!result.ok || !result.data) {
    return {
      currentHost: typeof window !== "undefined" ? window.location.hostname : "localhost",
      domains: [],
    };
  }
  const data = result.data;
  const rawList = Array.isArray(data.domains) ? data.domains : [];
  return {
    currentHost: data.currentHost || (typeof window !== "undefined" ? window.location.hostname : "localhost"),
    domains: rawList.map((d: any) => ({
      id: d.id,
      domain: d.domain,
      source: d.source || "auto",
      domainType: d.domainType || d.domain_type || "custom",
      domain_type: d.domain_type || d.domainType || "custom",
      status: d.status || "active",
      isVerified: Boolean(d.isVerified ?? d.is_verified ?? true),
      requestCount: Number(d.requestCount ?? d.request_count ?? 0),
      lastActiveAt: d.lastActiveAt || d.last_active_at || "",
      createdAt: d.createdAt || d.created_at || "",
    })),
  };
}

export async function createDomainInDb(domainData: Partial<RegisteredDomain>): Promise<RegisteredDomain> {
  const result = await safeJsonFetch<RegisteredDomain>(
    "/api/domains",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(domainData),
    },
    "/api/domains"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to register domain in database");
  }
  return result.data;
}

export async function updateDomainInDb(id: string, partial: Partial<RegisteredDomain>): Promise<RegisteredDomain> {
  const result = await safeJsonFetch<RegisteredDomain>(
    `/api/domains/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    },
    `/api/domains/${id}`
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to update domain in database");
  }
  return result.data;
}

export async function deleteDomainFromDb(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/domains/${id}`,
    { method: "DELETE" },
    `/api/domains/${id}`
  );
  return result.ok;
}

// -------------------------------------------------------------
// SETTINGS CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchSettingsFromDb(): Promise<SystemSettings> {
  const defaultSettings: SystemSettings = {
    siteName: "R Sender",
    siteLogo: "",
    favicon: "✉️",
    supportEmail: "support@rsender.io",
    neonConnectionString: "",
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
  };

  const result = await safeJsonFetch<SystemSettings>("/api/settings", undefined, "/api/settings");
  if (!result.ok || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return defaultSettings;
  }
  return result.data;
}

export async function saveSettingsToDb(
  settings: Partial<SystemSettings>
): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    "/api/settings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    "/api/settings"
  );
  return result.ok;
}

// -------------------------------------------------------------
// LOGS CRUD (NEON POSTGRES)
// -------------------------------------------------------------
export async function fetchLogsFromDb(limit = 100): Promise<LogEntry[]> {
  const result = await safeJsonFetch<any>(`/api/logs?limit=${limit}`, undefined, "/api/logs");
  if (!result.ok || !result.data) return [];
  return Array.isArray(result.data) ? result.data : (result.data.logs || []);
}

export async function addLogToDb(log: Partial<LogEntry>): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    "/api/logs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    },
    "/api/logs"
  );
  return result.ok;
}

export async function clearLogsInDb(): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    "/api/logs",
    { method: "DELETE" },
    "/api/logs"
  );
  return result.ok;
}

// -------------------------------------------------------------
// SECURE USER & ADMIN AUTHENTICATION
// -------------------------------------------------------------
export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: AppUser;
  admin?: AppUser;
  error?: string;
}

export async function loginUserApi(
  email: string,
  password: string,
  currentDomain?: string
): Promise<AuthResponse> {
  const domain = currentDomain || (typeof window !== "undefined" ? window.location.hostname : undefined);
  const result = await safeJsonFetch<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, currentDomain: domain }),
    },
    "/api/auth/login"
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.error || "Authentication failed",
    };
  }

  return result.data || { success: false, error: "Empty server response" };
}

export async function loginAdminApi(
  password: string,
  email?: string,
  currentDomain?: string
): Promise<AuthResponse> {
  const domain = currentDomain || (typeof window !== "undefined" ? window.location.hostname : undefined);
  const result = await safeJsonFetch<AuthResponse>(
    "/api/auth/admin-login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, email, currentDomain: domain }),
    },
    "/api/auth/admin-login"
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.error || "Administrative login failed",
    };
  }

  return result.data || { success: false, error: "Empty server response" };
}

export async function verifyAuthToken(
  token: string
): Promise<{ valid: boolean; user?: AppUser }> {
  const result = await safeJsonFetch<{ valid: boolean; user?: AppUser }>(
    "/api/auth/verify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    },
    "/api/auth/verify"
  );

  if (!result.ok || !result.data) {
    return { valid: false };
  }
  return result.data;
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string,
  userId?: string,
  token?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const result = await safeJsonFetch<{ success: boolean; message?: string; error?: string }>(
    "/api/auth/change-password",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ currentPassword, newPassword, userId }),
    },
    "/api/auth/change-password"
  );

  if (!result.ok) {
    return { success: false, error: result.error || "Password change failed" };
  }
  return result.data || { success: true };
}

export async function testResendApiKey(
  apiKey: string,
  fromEmail?: string
): Promise<ResendTestResult> {
  const result = await safeJsonFetch<ResendTestResult>(
    "/api/resend/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, fromEmail }),
    },
    "/api/resend/test"
  );

  if (!result.ok) {
    return {
      valid: false,
      message: result.error || "Failed to validate API key with Resend",
      error: result.error,
    };
  }
  return result.data || { valid: false, message: "No response from test" };
}

export async function fetchResendDomains(apiKey: string): Promise<{
  success: boolean;
  domains: Array<{ name: string; status: string }>;
  message?: string;
}> {
  const result = await safeJsonFetch<{
    success: boolean;
    domains: Array<{ name: string; status: string }>;
    message?: string;
  }>(
    "/api/resend/domains",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    },
    "/api/resend/domains"
  );

  if (!result.ok || !result.data) {
    return {
      success: false,
      domains: [],
      message: result.error || "Failed to fetch domains",
    };
  }
  return result.data;
}

export async function checkSetupStatus(): Promise<{
  isSetup: boolean;
  adminExists: boolean;
  error?: string;
}> {
  let result = await safeJsonFetch<{
    isSetup?: boolean;
    adminExists?: boolean;
    error?: string;
    message?: string;
  }>("/api/auth/setup-status", undefined, "/api/auth/setup-status");

  if (!result.ok && result.status === 404) {
    result = await safeJsonFetch<{
      isSetup?: boolean;
      adminExists?: boolean;
      error?: string;
      message?: string;
    }>("/api/auth/status", undefined, "/api/auth/status");
  }

  if (!result.ok) {
    // If endpoints are temporarily unreachable, assume setup is complete so admin login is presented
    return { isSetup: true, adminExists: true, error: result.error };
  }

  const data = result.data || {};
  return {
    isSetup: Boolean(data.isSetup || data.adminExists),
    adminExists: Boolean(data.adminExists || data.isSetup),
    error: data.error,
  };
}

export async function setupMasterAdmin(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  success: boolean;
  token?: string;
  admin?: AppUser;
  error?: string;
  message?: string;
  adminExists?: boolean;
}> {
  const result = await safeJsonFetch<{
    success?: boolean;
    token?: string;
    admin?: AppUser;
    error?: string;
    message?: string;
    adminExists?: boolean;
  }>(
    "/api/auth/setup-admin",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "/api/auth/setup-admin"
  );

  if (!result.ok) {
    const errorText = result.error || "";
    const isAlreadyConfigured =
      result.status === 409 ||
      result.data?.adminExists === true ||
      errorText.toLowerCase().includes("already configured") ||
      errorText.toLowerCase().includes("already exists") ||
      errorText.toLowerCase().includes("already has a master");

    return {
      success: false,
      adminExists: isAlreadyConfigured,
      error: errorText || "Master administrator setup failed",
    };
  }

  const data = result.data || {};
  const isAlreadyConfigured =
    result.status === 409 ||
    data.adminExists === true ||
    (typeof data.error === "string" &&
      (data.error.toLowerCase().includes("already configured") ||
        data.error.toLowerCase().includes("already exists") ||
        data.error.toLowerCase().includes("already has a master")));

  return {
    success: data.success === true,
    token: data.token,
    admin: data.admin,
    message: data.message,
    error: data.error,
    adminExists: isAlreadyConfigured ? true : data.adminExists,
  };
}

export async function sendEmailViaResend(
  payload: SendEmailPayload
): Promise<SendEmailResult> {
  const result = await safeJsonFetch<SendEmailResult>(
    "/api/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "/api/resend/send"
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.error || "Failed sending email via provider",
    };
  }

  return result.data || { success: false, error: "Empty dispatch response" };
}

export const sendEmailUnified = sendEmailViaResend;

// -------------------------------------------------------------
// SUPABASE S3 STORAGE SERVICE
// -------------------------------------------------------------
export async function getStorageConfig(): Promise<SupabaseStorageConfig> {
  const result = await safeJsonFetch<SupabaseStorageConfig>(
    "/api/storage/config",
    undefined,
    "/api/storage/config"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to load storage configuration");
  }
  return result.data;
}

export async function saveStorageConfig(
  config: Partial<SupabaseStorageConfig>
): Promise<SupabaseStorageConfig> {
  const result = await safeJsonFetch<SupabaseStorageConfig>(
    "/api/storage/config",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
    "/api/storage/config"
  );
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Failed to save storage configuration");
  }
  return result.data;
}

export async function testStorageConnection(
  config?: Partial<SupabaseStorageConfig>
): Promise<{
  connected: boolean;
  message: string;
  pingMs?: number;
  bucket?: string;
  endpoint?: string;
}> {
  const result = await safeJsonFetch<{
    connected: boolean;
    message: string;
    pingMs?: number;
    bucket?: string;
    endpoint?: string;
  }>(
    "/api/storage/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config || {}),
    },
    "/api/storage/test"
  );

  if (!result.ok || !result.data) {
    return {
      connected: false,
      message: result.error || "Storage test connection failed",
    };
  }
  return result.data;
}

export async function uploadFileToStorage(payload: {
  fileName: string;
  base64Content: string;
  mimeType: string;
  source?: "attachment" | "recipient_csv" | "logo" | "favicon" | "general";
  uploadedBy?: string;
}): Promise<{
  success: boolean;
  file?: UploadedFileRecord;
  error?: string;
}> {
  const result = await safeJsonFetch<{
    success: boolean;
    file?: UploadedFileRecord;
    error?: string;
  }>(
    "/api/storage/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "/api/storage/upload"
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.error || "Failed to upload file to storage",
    };
  }
  return result.data || { success: false, error: "Empty upload response" };
}

export async function getUploadedFiles(limit = 100): Promise<UploadedFileRecord[]> {
  const result = await safeJsonFetch<{ files?: UploadedFileRecord[] }>(
    `/api/storage/files?limit=${limit}`,
    undefined,
    "/api/storage/files"
  );
  if (!result.ok || !result.data) return [];
  return result.data.files || [];
}

export async function deleteUploadedFile(id: string): Promise<boolean> {
  const result = await safeJsonFetch<any>(
    `/api/storage/files/${id}`,
    { method: "DELETE" },
    `/api/storage/files/${id}`
  );
  return result.ok;
}

export interface IpInfo {
  ip: string;
  country?: string | null;
  city?: string | null;
  colo?: string | null;
  isCloudflare?: boolean;
}

/**
 * Detects the active IP address assigned or routed by Cloudflare Pages / Edge
 * First queries Cloudflare's native edge trace endpoint (/cdn-cgi/trace),
 * then falls back to /api/ip and public IP resolver.
 */
export async function fetchCurrentIp(): Promise<IpInfo> {
  // 1. Cloudflare Pages edge trace (available on every Cloudflare deployment)
  try {
    const traceRes = await fetch("/cdn-cgi/trace", { cache: "no-store" });
    if (traceRes.ok) {
      const text = await traceRes.text();
      const lines = text.split("\n");
      const data: Record<string, string> = {};
      for (const line of lines) {
        const [k, ...v] = line.split("=");
        if (k) data[k.trim()] = v.join("=").trim();
      }
      if (data.ip && !data.ip.startsWith("127.") && data.ip !== "::1") {
        return {
          ip: data.ip,
          country: data.loc || null,
          colo: data.colo || null,
          isCloudflare: true,
        };
      }
    }
  } catch {
    // Continue to next resolution strategy
  }

  // 2. Cloudflare Pages Function & Express server API endpoint
  try {
    const result = await safeJsonFetch<IpInfo>(
      "/api/ip",
      undefined,
      "/api/ip"
    );
    if (result.ok && result.data?.ip && !result.data.ip.startsWith("127.") && result.data.ip !== "::1") {
      return result.data;
    }
  } catch {
    // Continue
  }

  // 3. Public IP fallback for local or non-proxied development
  try {
    const fallbackRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (fallbackRes.ok) {
      const json = await fallbackRes.json();
      if (json?.ip) {
        return {
          ip: json.ip,
          isCloudflare: false,
        };
      }
    }
  } catch {
    // Fallback failure handled below
  }

  return {
    ip: "127.0.0.1",
    isCloudflare: false,
  };
}

