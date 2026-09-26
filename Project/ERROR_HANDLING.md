# 🛡️ Error Handling Architecture & Inventory

**Document ID:** `ERROR-HANDLING-2026-09-26`  
**Application Target:** R Sender / X-Mailer Full-Stack Platform  
**Purpose:** Comprehensive inventory of all existing error handling patterns across the application, identification of unhandled failure vectors, and the engineering plan for bulletproof error resilience.

---

## 1. Existing Active Error Handling

### 1.1 Authentication & Security (`server/auth.ts`, `server.ts`)
- **Brute-Force Rate Limiting:**
  - In-memory rate limiting tracker keyed by `user_${ip}_${email}` and `admin_${ip}`.
  - Locks out after 5 consecutive failed attempts with a dynamic 60-second cooldown timer.
- **Cryptographic Password Hash Verification:**
  - PBKDF2 with SHA-512, 100,000 iterations, 32-byte salt.
  - Timing-safe buffer comparison (`crypto.timingSafeEqual`) prevents timing attack vulnerabilities.
- **Session Verification:**
  - Cryptographically signed HMAC-SHA256 tokens with 7-day expiration.
  - Active database verification checks for user deactivation on each session token validation.

### 1.2 Database Resilience & Failover (`server/db.ts`, `functions/api/[[catchall]].ts`)
- **Placeholder Connection Guard:**
  - `isPlaceholderUrl()` detects default Neon placeholders (`your-project.neon.tech`, `user:password@`).
  - Sets `hasRealDatabaseUrl: false` and skips connection attempts, avoiding 10-second DNS timeouts (`ENOTFOUND`).
- **Idle Client Error Handler:**
  - `pool.on("error")` prevents process termination on unexpected idle PostgreSQL connection dropouts.
- **Stateless Serverless Client:**
  - In Cloudflare Pages (`functions/api/[[catchall]].ts`), uses `@neondatabase/serverless` HTTP client with individual DDL migrations per statement, avoiding multi-statement transaction rejection.
- **Safe JSON API Fetcher (`src/services/apiService.ts`):**
  - `safeJsonFetch()` inspects raw response text before parsing. If response begins with `<!DOCTYPE` or `<html`, it traps the HTML error page (e.g. Cloudflare 500/502/404) and converts it into a human-readable diagnostic message.

### 1.3 Provider & Deliverability Engine (`server/providers/`, `src/utils/`)
- **HTTP 429 Adaptive Backoff Retry (`src/context/AppContext.tsx`):**
  - Regex detects provider rate limit errors (`/429|rate\s*limit|too\s*many\s*requests|rate_limit_exceeded/i`).
  - Retries up to 3 times per recipient with progressive backoff pause (`Math.max(3500, delayMs * (retry + 0.5))`).
- **SMTP TLS Security:**
  - Enforces `rejectUnauthorized: true` and `minVersion: 'TLSv1.2'` by default on remote SMTP servers.
  - Standalone verification transporter in `verifySmtp` maps codes (`EAUTH`, `ECONNREFUSED`, `ETIMEDOUT`) into actionable error messages.
- **CRLF Injection Defense:**
  - `sanitizeHeaderValue()` strips `\r`, `\n`, `\0`, and ASCII control characters from all headers and Reply-To addresses.

---

## 2. Identified Error Handling Gaps & Vulnerabilities

| Error Gap ID | Component / File | Vulnerability Description | Failure Consequence |
| :---: | :--- | :--- | :--- |
| **GAP-01** | `AppContext.tsx` (`runNextEmail`) | `sendEmailViaResend` wrapped in bare `try/catch` that only executes `console.error`. | Recipient remains permanently stuck in `'sending'` state; task finishes without reporting failure. |
| **GAP-02** | `AppContext.tsx` (`runNextEmail`) | `afterTask.recipients[nextRecipientIndex]` updated by stale closure index. | Race condition where wrong recipient is marked as sent/failed if list changes in flight. |
| **GAP-03** | `functions/api/[[catchall]].ts` | Rejects any request without `apiKey` with `400: Resend API key is required`. | Complete dispatch failure for all Custom SMTP channels on Cloudflare Pages. |
| **GAP-04** | `AppContext.tsx` (`runNextEmail`) | `fetch(att.url)` from browser to Supabase S3 bucket. | Silent attachment omission when S3 bucket lacks CORS; email sent without attached files. |
| **GAP-05** | `server/providers/smtp.ts` | `Buffer.from(att.content, 'base64')` assumes raw base64 string. | File corruption if base64 contains `data:*/*;base64,` prefix. |
| **GAP-06** | `server.ts` (`/api/resend/send`) | `emailPayload.to = recipientList[0]`. | Silent truncation of recipients when multiple emails are passed to `/api/send`. |

---

## 3. Phased Error Handling Implementation Plan

### Phase 1: Global Settings Error Recovery (IMPLEMENTED & VERIFIED)
- **Admin Settings Schema Migration Protection:**
  - Wrapped all `ALTER TABLE neon_settings ADD COLUMN IF NOT EXISTS` in individual idempotent try-catch statements in `server/db.ts` and `functions/api/[[catchall]].ts`.
- **Unsubscribe Fallback Guarantee:**
  - If user `unsubscribeUrl` is invalid or empty, gracefully fallbacks to `settings.defaultUnsubscribeUrl` (`https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}`), eliminating missing header penalties and ensuring 100% RFC 8058 header coverage.

### Phase 2: Dual-Runtime Edge Recovery (IMPLEMENTED & VERIFIED)
- **Cloudflare Edge Route Alignment:**
  - Bound both `/api/send` and `/api/resend/send` in `functions/api/[[catchall]].ts`.
  - Added graceful edge protocol detection for Custom SMTP: returns structured JSON with `EDGE_RUNTIME_SMTP_UNSUPPORTED` and actionable guidance rather than throwing an unhandled runtime error.
- **Anti-Phishing Link Rewriting Elimination:**
  - Enforced `open_tracking: false` and `click_tracking: false` by default in both `server/providers/resend.ts` and `functions/api/[[catchall]].ts`, preventing SpamAssassin `PHISH_URL_MISMATCH` penalties.

### Phase 3: Recipient State Machine Immunity
- **Bulletproof Dispatch Try/Catch:**
  - Modify `catch (err: any)` in `runNextEmail`:
    ```typescript
    recs[targetIdx] = {
      ...recs[targetIdx],
      status: 'failed',
      error: err.message || 'Dispatch network exception',
      sentAt: new Date().toLocaleTimeString(),
    };
    stats.failed += 1;
    stats.remaining = Math.max(0, stats.remaining - 1);
    updateTask(taskId, { recipients: recs, stats, ... });
    ```
- **Immutable Recipient Lookup:**
  - Replace `recs[nextRecipientIndex]` with `const targetIdx = recs.findIndex(r => r.email === recipient.email)`.

### Phase 4: Attachment Fault Tolerance
- **Backend Attachment Proxy:**
  - Add `GET /api/storage/attachment/:id` endpoint in `server.ts` that streams files with `Content-Type` and proper CORS.
  - If client-side S3 fetch encounters a CORS error, automatically retry via backend proxy.
- **Base64 Header Sanitizer:**
  - Strip `data:[^;]+;base64,` regex before passing to Resend and Nodemailer buffers.

### Phase 5: Header Syntax Error Guard
- **RFC 5322 Section 3.4 Quoted-String Guard:**
  - In `sanitizeHeaderValue` and `server.ts`, if a display name contains special characters (`[,;:<>]`), automatically wrap in escaped double quotes: `"${name.replace(/"/g, '\\"')}" <${email}>`.
