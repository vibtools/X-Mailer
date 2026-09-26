# 🔬 Forensic Audit & Vulnerability Report: Email Sending Architecture

**Document ID:** `FORENSIC-AUDIT-2026-09-26-PROD-HARDENING`  
**Application Target:** R Sender / X-Mailer Full-Stack Platform  
**Audit Scope:** Client-Side Dispatch Engine (`AppContext.tsx`), Backend Routing (`server.ts`, `functions/api/[[catchall]].ts`), Provider Engine (`server/providers/`), Content & Template Utilities (`antiSpamHeaders.ts`, `dynamicTags.ts`, `htmlToPlainText.ts`).  
**Baseline State:** `FROZEN AT 2026-09-26`  
**Methodology:** Static code analysis, execution tracing, RFC compliance verification (RFC 8058, RFC 5322, RFC 2046), and provider API contracts (Resend REST API, Nodemailer SMTP).

---

## Executive Summary

A thorough, evidence-based forensic investigation of the email dispatch pipeline was conducted. The audit verified that while foundational multi-provider routing and deliverability checks exist, **five critical vulnerabilities** exist in the code that directly cause task execution freezes, silent failure modes, deliverability degradation, and spam classification.

Each issue is documented below with **exact file paths, line numbers, verbatim code citations, technical root cause, and strict Phase Scope Locks**.

---

## 🔍 Vulnerability Inventory & Root Cause Analysis

### 🔴 Vulnerability 01: Inactive RFC 8058 List-Unsubscribe Header by Default (Spam Penalty)
- **Files Affected:**
  - `src/utils/antiSpamHeaders.ts` (Lines 206–269)
  - `src/context/AppContext.tsx` (Lines 854–867)
  - `src/components/pages/TasksPage.tsx` (Line 173)
  - `src/components/pages/ContentPage.tsx` (Line 169)
- **Code Proof:**
  ```typescript
  // src/utils/antiSpamHeaders.ts (Lines 214–220, 256–268)
  const cleanCustomUrl = unsubscribeUrl ? sanitizeHeaderValue(unsubscribeUrl).trim() : '';

  if (cleanCustomUrl) {
    ...
    resultHeaders['List-Unsubscribe'] = `<${finalUnsubUrl}>`;
    resultHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  } else {
    // When cleanCustomUrl is empty and no explicit mailto is passed:
    // NO List-Unsubscribe and NO List-Unsubscribe-Post headers are generated!
  }
  ```
- **Technical Root Cause:**
  In `TasksPage.tsx` and `ContentPage.tsx`, `unsubscribeUrl` defaults to an empty string `""`. In `AppContext.tsx`, `effectiveUnsubscribeUrl` is evaluated as `(currentTask.unsubscribeUrl || contentRef.current.unsubscribeUrl || '').trim()`. When empty, `generateAntiSpamHeaders` emits zero unsubscribe headers.
- **Deliverability & Spam Impact:**
  Under Google & Yahoo's 2024 Bulk Sender Mandates, all bulk email dispatches must include RFC 8058 One-Click Unsubscribe headers. Without them:
  1. Emails fail bulk sender compliance and are automatically demoted to the **Spam / Junk folder**.
  2. Recipients lack an in-client "Unsubscribe" action, forcing them to click **"Report Spam"**, which irreversibly damages sender domain reputation.
- **Remediation Strategy (Phase 1):**
  Create an **Admin Content Settings Page** (`AdminContentSettingsPage.tsx`) allowing administrators to configure a system-wide default Unsubscribe URL (e.g. `https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}`), with master feature toggles. When a user has not configured a custom URL, the system seamlessly applies the admin default, ensuring RFC 8058 compliance on 100% of dispatches.
- **Scope Lock:** `src/components/admin/AdminContentSettingsPage.tsx`, `src/components/admin/AdminLayout.tsx`, `server/db.ts`, `server.ts`, `functions/api/[[catchall]].ts`, `src/services/apiService.ts`, `src/types/index.ts`, `src/utils/antiSpamHeaders.ts`, `src/context/AppContext.tsx`.

---

### 🔴 Vulnerability 02: Resend Tracking Link Rewriting & Cloudflare SMTP Incompatibility
- **Files Affected:**
  - `server/providers/resend.ts` (Lines 20–26)
  - `functions/api/[[catchall]].ts` (Lines 2165–2258)
  - `src/context/AppContext.tsx` (Lines 870–901)
- **Code Proof:**
  ```typescript
  // server/providers/resend.ts (Lines 20–26)
  const resendPayload: Record<string, any> = {
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html || "",
    text: payload.text || undefined,
  };
  // Neither open_tracking nor click_tracking options are forwarded!
  ```
  ```typescript
  // functions/api/[[catchall]].ts (Lines 2186–2187)
  const key = apiKey || env.RESEND_API_KEY;
  if (!key) return errorResponse("Resend API key is required", 400);
  // Custom SMTP channels lack apiKey, immediately crashing on Cloudflare Pages with HTTP 400!
  ```
- **Technical Root Cause:**
  1. Resend API defaults to injecting an invisible 1x1 tracking pixel and rewriting all hyperlinks into `https://resend.com/c/...` redirect links unless explicitly disabled.
  2. In `functions/api/[[catchall]].ts`, `/api/resend/send` only accepts Resend API keys. When a user executes a task using a Custom SMTP channel on Cloudflare Pages, `apiKey` is empty, triggering an immediate HTTP 400 rejection.
- **Deliverability & Spam Impact:**
  1. **Domain Mismatch & Phishing Flag (SpamAssassin `PHISH_URL_MISMATCH`):** When sending from `domain.com`, rewriting links to `resend.com/c/...` triggers corporate anti-phishing gateways (Proofpoint, Microsoft Defender), as link destinations do not match the sender's authenticated domain.
  2. Cloudflare Pages deployments cannot dispatch via Custom SMTP channels.
- **Remediation Strategy (Phase 2):**
  1. Add master tracking toggles (`open_tracking: false`, `click_tracking: false`) forwarded directly to Resend API.
  2. Upgrade `functions/api/[[catchall]].ts` to support dual-runtime parity (`/api/send` and `/api/resend/send`), routing SMTP channels gracefully or providing clear diagnostic responses.
- **Scope Lock:** `server/providers/resend.ts`, `functions/api/[[catchall]].ts`, `server.ts`, `src/services/apiService.ts`.

---

### 🔴 Vulnerability 03: Task Runner Exception Freeze & Recipient State Machine Stagnation
- **Files Affected:**
  - `src/context/AppContext.tsx` (Lines 622, 676–688, 903–916, 1020–1029)
- **Code Proof:**
  ```typescript
  // src/context/AppContext.tsx (Lines 677–683)
  updatedRecipients[nextRecipientIndex] = {
    ...recipient,
    status: 'sending',
    apiIdUsed: selectedApi.id,
    apiNameUsed: selectedApi.name,
  };

  // Lines 1020–1022:
  } catch (err: any) {
    console.error('Task dispatch exception:', err);
  }
  // The catch block NEVER resets recipient.status to 'failed' or 'pending'!
  ```
- **Technical Root Cause:**
  When `sendEmailViaResend` encounters an unhandled exception (network drop, DNS failure, 500 HTML response, or client disconnect), the `catch` block merely logs to console. The recipient remains permanently in `'sending'` status. On the next loop, `findIndex(r => r.status === 'pending')` skips this recipient. When all pending recipients finish, the task marks itself `'completed'`, leaving failed recipients orphaned. `retryFailedRecipients` only looks for `'failed'`, so stuck recipients can never be retried.
  Additionally, updating `recs[nextRecipientIndex]` after an asynchronous `await` (1–3 seconds) introduces race conditions if the recipient list was mutated during flight.
- **Remediation Strategy (Phase 3):**
  1. Wrap dispatch execution in a resilient state-machine handler: on any caught exception, immediately mark the recipient as `'failed'` with the exact error message.
  2. Lookup recipients by immutable identifier/email (`recs.findIndex(r => r.email === recipient.email)`) instead of stale closure index.
  3. Allow `retryFailedRecipients` to reset both `'failed'` and orphaned `'sending'` records.
- **Scope Lock:** `src/context/AppContext.tsx`.

---

### 🔴 Vulnerability 04: Silent Attachment Loss via Unhandled Client-Side S3 CORS Fetching
- **Files Affected:**
  - `src/context/AppContext.tsx` (Lines 822–844)
  - `src/components/pages/ContentPage.tsx` (Lines 286–305)
  - `server.ts` (Line 2694)
  - `server/providers/smtp.ts` (Lines 123–129)
- **Code Proof:**
  ```typescript
  // src/context/AppContext.tsx (Lines 822–844)
  if (att.url) {
    try {
      const response = await fetch(att.url); // Cross-origin fetch to Supabase S3
      if (response.ok) {
        ...
        validTaskAttachments.push(item);
      }
    } catch (err) {
      console.warn('[AppContext] Failed to read attachment from S3 URL:', err);
    }
  }
  // If S3 bucket lacks CORS for the current domain, fetch throws TypeError and attachment is dropped!
  ```
- **Technical Root Cause:**
  `ContentPage.tsx` stores only the S3 URL in template state. When `AppContext.tsx` runs in the browser, `fetch(att.url)` initiates a client-side cross-origin request. If CORS headers (`Access-Control-Allow-Origin`) are missing on the bucket, the browser blocks the fetch. The error is silently swallowed, and the email is dispatched with zero attachments without warning the user.
  Additionally, if base64 data includes a `data:*/*;base64,` prefix, passing it to `Buffer.from(content, 'base64')` in `server/providers/smtp.ts` corrupts the binary header.
- **Remediation Strategy (Phase 4):**
  1. Introduce a server-side attachment proxy endpoint (`GET /api/storage/attachment/:id` or fallback buffer streaming) to eliminate browser CORS restrictions.
  2. Sanitize all base64 attachment strings by stripping any leading `data:*;base64,` prefixes before passing to Resend and Nodemailer.
  3. If an attachment fails to load, notify the user in task logs rather than silently omitting it.
- **Scope Lock:** `src/context/AppContext.tsx`, `server.ts`, `server/providers/smtp.ts`, `server/providers/resend.ts`.

---

### 🔴 Vulnerability 05: Internal API Key Label Leaks into Email `From` Header as Sender Name
- **Files Affected:**
  - `src/context/AppContext.tsx` (Lines 709–721)
  - `server.ts` (Lines 2540–2552)
- **Code Proof:**
  ```typescript
  // src/context/AppContext.tsx (Lines 709–713)
  if (!rawSenderName || rawSenderName === 'R Sender' || rawSenderName === 'Sarah from R Sender' || rawSenderName === 'R Sender Support') {
    const emailForName = (selectedApi.senderEmail || '').trim();
    if (selectedApi.name && selectedApi.name !== 'Default' && selectedApi.name !== 'R Sender') {
      rawSenderName = selectedApi.name; // <--- Internal database label becomes From: Name!
    }
  ```
- **Technical Root Cause:**
  When `rawSenderName` matches default placeholder values, the code replaces it with `selectedApi.name`. If a user names their key `"Resend Production Key 03"` or `"Backup SMTP Relay"`, outgoing emails display:
  `From: Resend Production Key 03 <notifications@company.com>`.
  Furthermore, if `cleanName` contains special characters (such as commas, e.g. `"Doe, John"`), it is not enclosed in double quotes as required by RFC 5322 Section 3.4, resulting in header syntax errors on strict MTA relays.
- **Deliverability & Spam Impact:**
  Internal infrastructure labels appearing in recipient inboxes alarm users, triggering immediate **"Report Spam"** or **"Phishing"** reports. Unquoted commas cause mail transfer agents to interpret `"Doe"` and `"John <email>"` as two separate entities, corrupting the `From:` header.
- **Remediation Strategy (Phase 5):**
  1. Remove automatic override of sender name with raw technical API key labels. Use verified domain name or system company name instead.
  2. Enforce RFC 5322 quoting for sender display names containing commas or special characters: `"${cleanName}" <${email}>`.
- **Scope Lock:** `src/context/AppContext.tsx`, `server.ts`, `src/utils/antiSpamHeaders.ts`.

---

## 🎯 Verification Matrix

| Vulnerability | Target Phase | Primary Verification Method | Success Criteria |
| :--- | :---: | :--- | :--- |
| **01: Unsubscribe Header Inactivity** | Phase 1 | Header inspection test on blank user config | Default Admin Unsubscribe URL attaches RFC 8058 headers on 100% of emails. |
| **02: Resend Tracking Phishing Flag** | Phase 2 | Resend payload inspection | `open_tracking: false` & `click_tracking: false` verified; no `resend.com/c/` link rewrites. |
| **03: Task Runner Exception Freeze** | Phase 3 | Simulated network failure test | Thrown exception marks recipient as `'failed'`; no recipients remain stuck in `'sending'`. |
| **04: S3 CORS Attachment Drops** | Phase 4 | Cross-origin attachment dispatch test | Attachment arrives intact; base64 headers cleaned; no binary file corruption. |
| **05: Internal API Key Label Leak** | Phase 5 | `From:` header format test with technical key name | Clean business display name rendered; technical key labels never leak; names with commas quoted. |
