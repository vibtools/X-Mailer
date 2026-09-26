# 🛡️ Error Handling & Fault Resilience Architecture

**Document ID:** `EHA-2026-09-26-AUDIT`  
**System:** R Sender Platform  
**Scope:** Comprehensive Inventory of Current App Error Handling & Detailed Error Handling Upgrades Across the 7 Deliverability Phases  
**Baseline State:** `FROZEN AT 2026-09-26`

---

## 1. Existing Error Handling Architecture Inventory

The R Sender application currently employs error-handling mechanisms across four primary layers:

### 1.1 Client-Side Safe Network Interception (`src/services/apiService.ts`)
- **`safeJsonFetch<T>` Engine:**
  - Intercepts all raw response text before JSON parsing.
  - Automatically identifies HTML error pages (`<!DOCTYPE`, `<html`, or `<`) returned by Cloudflare Pages or Express during edge crashes, 404 routing misses, or 502 Bad Gateway events.
  - Synthesizes clean, human-readable error messages explaining whether `DATABASE_URL` is missing or Cloudflare Functions are undeployed, completely eliminating `SyntaxError: Unexpected token '<'` exceptions.
- **Fail-Safe Fallbacks:**
  - DB health checks return structured disconnected objects instead of throwing uncaught exceptions.
  - Dynamic tags and header sanitizers have local try/catch fallbacks.

### 1.2 Dispatch Engine & Task Runner (`src/context/AppContext.tsx`)
- **Per-Recipient Fault Isolation:**
  - Individual email dispatch calls are wrapped in `try/catch` blocks.
  - If a single recipient fails (due to invalid email, DNS bounce, or API error), the failure is recorded in `task.recipients[index].status = 'failed'` with the exact error message.
  - The task queue does **not** crash or abort; it increments `stats.failed` and proceeds to the next recipient after the configured delay.
- **Quota & API Pool Guards:**
  - Before dispatching, the runner checks `currentUser.usedToday >= currentUser.dailyLimit`. If exceeded, the task automatically enters a paused state with an informative log.
  - If no active API keys are assigned to the task (`availableTaskApis.length === 0`), the task immediately returns to `idle` with an error message instead of throwing an undefined reference error.

### 1.3 Express & Cloudflare Backend Layer (`server.ts` & `functions/api/[[catchall]].ts`)
- **Stateless Neon DB Client & Connection Guards:**
  - In `server/db.ts`, `isPlaceholderUrl` detects unconfigured hostnames (`your-project.neon.tech`) and prevents 10-second DNS lookup timeouts (`ENOTFOUND`).
  - Idle pool error listener (`pool.on('error')`) prevents unhandled socket exceptions from terminating the Node.js process.
- **Provider API Response Handling:**
  - Both backends inspect provider response codes (`resendRes.ok`, `transporter.sendMail`). If the provider returns HTTP 4xx or 5xx, the JSON payload (`error.message`, `error.name`) is extracted and surfaced to the caller with the appropriate status code.
  - Every dispatch attempt (success or failure) is logged to `neon_logs` with recipient metadata.

### 1.4 MIME & Header Sanitizers (`src/utils/`)
- **CRLF Injection Prevention:** `sanitizeHeaderValue` and `sanitizeReplyTo` remove `\r`, `\n`, null bytes, and non-printable control characters from headers.
- **Plain-Text Parsing Boundary:** `htmlToPlainText` is wrapped in a `try/catch` block with an automatic regex tag-stripping fallback if complex HTML fails to parse.

---

## 2. Identified Error Handling Gaps Across the 7 Deliverability Phases

Despite existing protections, seven deliverability-specific error handling gaps were discovered during the audit. The table below details what is currently vulnerable and the exact defensive error guard to be implemented in each phase:

| Gap ID | Area | Current Error Vulnerability | Required Error Handling & Defensive Guard | Target Phase |
| :---: | :--- | :--- | :--- | :---: |
| **ERR-GAP-01** | Unsubscribe Headers | Silent generation of synthetic 404 URLs when no unsubscribe URL is provided. | Check `options.unsubscribeUrl`. If empty or invalid URL, do not attach `List-Unsubscribe` headers; do not throw or fabricate dead URLs. | **Phase 1** |
| **ERR-GAP-02** | Sender Name Fallback | Unhandled empty sender name silently falls back to hardcoded "Sarah from R Sender". | Clean fallback chain: active channel name -> sender email username -> company name. Log error/warning if sender email cannot be parsed. | **Phase 2** |
| **ERR-GAP-03** | Reply-To Resolution | Unhandled empty Reply-To silently synthesizes non-existent `support@${domain}`. | Fallback to authenticated `senderBareEmail`. Validate MX-readiness by preventing synthetic subdomain fabrication. | **Phase 3** |
| **ERR-GAP-04** | SMTP Message-ID | Nodemailer silently falls back to server machine hostname (`@run.app` or `@localhost`). | Try/catch Message-ID generation with sender domain. If domain is unparseable, fall back to safe domain parser; never leak internal server hostname. | **Phase 4** |
| **ERR-GAP-05** | Empty Body Handling | Empty email body silently defaults to `"Hello {name}"` or `"Notification from R Sender"`. | Pre-flight validation error: return HTTP 400 with `"Email body cannot be empty"`. Auto-derive plain text from HTML via `htmlToPlainText` if text is omitted. | **Phase 5** |
| **ERR-GAP-06** | Resend 429 Rate Limits | Resend 429 `rate_limit_exceeded` is treated as a fatal failure, burning recipient status. | Adaptive retry handler: intercept 429, log warning, pause queue for 3s backoff, and retry recipient up to 3 times before marking failed. | **Phase 6** |
| **ERR-GAP-07** | SMTP TLS Handshake | Insecure `rejectUnauthorized: false` allows MITM and unverified certificates. | Enforce strict TLS validation (`rejectUnauthorized: true`). Catch SSL/TLS handshake errors (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED`) and return descriptive error. | **Phase 7** |

---

## 3. Phase-by-Phase Error Handling Implementation Details

### Phase 1 Defensive Error Guard:
- In `antiSpamHeaders.ts`:
  ```typescript
  if (!options.unsubscribeUrl || !options.unsubscribeUrl.trim()) {
    // Graceful omission: Do not emit List-Unsubscribe if no real URL exists
    return resultHeaders;
  }
  ```

### Phase 2 Defensive Error Guard:
- In `AppContext.tsx`:
  ```typescript
  if (!rawSenderName || !rawSenderName.trim()) {
    rawSenderName = selectedApi.name || (senderBareEmail ? senderBareEmail.split('@')[0] : 'Support');
  }
  ```

### Phase 3 Defensive Error Guard:
- In `antiSpamHeaders.ts`:
  ```typescript
  if (!cleanReplyTo) {
    // Safe fallback to sender's verified address; never fake support@
    return senderBareEmail || undefined;
  }
  ```

### Phase 4 Defensive Error Guard:
- In `server/providers/smtp.ts`:
  ```typescript
  try {
    const domain = senderEmail.split('@')[1]?.toLowerCase().trim() || 'localhost';
    mailOptions.messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;
  } catch (err) {
    console.warn('[SMTP] Message-ID generation fallback:', err);
  }
  ```

### Phase 5 Defensive Error Guard:
- In `server.ts`:
  ```typescript
  if (!emailPayload.html?.trim() && !emailPayload.text?.trim()) {
    return res.status(400).json({ error: "Email body content is required. Empty messages cannot be dispatched." });
  }
  ```

### Phase 6 Defensive Error Guard:
- In `AppContext.tsx`:
  ```typescript
  if (res.status === 429 || res.error?.includes('rate_limit_exceeded')) {
    addLog({ level: 'warn', message: `Resend API rate limit encountered for ${recipient.email}. Pausing 3s before retry...` });
    await new Promise(r => setTimeout(r, 3000));
    // Retry dispatch
  }
  ```

### Phase 7 Defensive Error Guard:
- In `server/providers/smtp.ts`:
  ```typescript
  transporter.verify((err, success) => {
    if (err) {
      console.error('[SMTP TLS] Certificate or connection handshake error:', err.message);
    }
  });
  ```
