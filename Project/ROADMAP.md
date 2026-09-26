# 🗺️ Production Execution Roadmap: 5-Phase Production Hardening Campaign

**Document ID:** `ROADMAP-2026-09-26-5PHASE-PROD-HARDENING`  
**Execution Strategy:** Strict Sequential Phased Delivery (Phase 1 through Phase 5)  
**Goal:** Completely eliminate the 5 core vulnerabilities identified in `FORENSIC_AUDIT_REPORT.md` while introducing the Admin "Content Settings" page and bulletproof delivery architecture.  
**Baseline State:** `FROZEN AT 2026-09-26`

---

## High-Level 5-Phase Strategic Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Admin Panel "Content Settings" Page & Global Unsubscribe Engine   │
│ ➔ Build Admin Content Settings Page; Master Feature Toggles (ON/OFF);       │
│   Default Unsubscribe URL (https://unsubscribe.sotflo.com/unsubscribe)      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Resend Tracking Deactivation & Dual-Runtime Provider Parity        │
│ ➔ Disable Resend open/click tracking to prevent phishing redirect penalties;│
│   Fix Custom SMTP channel routing on Cloudflare Pages Functions             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Task Runner Exception Resilience & Recipient State Immunity         │
│ ➔ Eliminate stuck 'sending' state on fetch errors; fix stale index race;     │
│   Ensure 100% reliable retry mechanism for failed/orphaned dispatches       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: S3/Supabase Attachment Streaming & Base64 Pipeline Sanitization    │
│ ➔ Eliminate client-side CORS attachment drops; stream attachments reliably; │
│   Strip 'data:*/*;base64,' prefixes to prevent binary corruption            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Sender Identity Safeguard & RFC 5322 Display Name Quoting          │
│ ➔ Prevent internal API key labels from leaking into From: headers;          │
│   Enforce RFC 5322 quoting for display names with commas and symbols        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📌 Phase 1: Admin Panel "Content Settings" Page & Global Unsubscribe Engine

- **Target Vulnerability:** Vulnerability 01 (Inactive RFC 8058 List-Unsubscribe Header on unconfigured user templates)
- **Primary Objective:** 
  1. Build a new administrative page `AdminContentSettingsPage.tsx` under `src/components/admin/` and add it to `AdminLayout.tsx` navigation.
  2. Implement comprehensive controls for content defaults:
     - Master feature toggles (ON/OFF) for all content features.
     - Default Unsubscribe URL setting with instant fallback to `https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}`.
     - Global One-Click Unsubscribe (RFC 8058) master toggle.
     - Master kill-switch for Resend Tracking (Open & Click Tracking).
     - Default Auto Reply-To policy toggle.
     - Default Sender Name and Subjects.
  3. Extend `neon_settings` schema in `server/db.ts` and `functions/api/[[catchall]].ts` with persistent columns.
  4. Wire `antiSpamHeaders.ts` and `AppContext.tsx` so that when a user leaves `unsubscribeUrl` blank, the system automatically uses the Admin Default Unsubscribe URL, ensuring 100% of emails carry RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- **Target Files:**
  - `src/components/admin/AdminContentSettingsPage.tsx` (New)
  - `src/components/admin/AdminLayout.tsx` (Modified)
  - `server/db.ts` (Modified schema migrations)
  - `server.ts` (Modified settings endpoints)
  - `functions/api/[[catchall]].ts` (Synchronized settings endpoints)
  - `src/services/apiService.ts` (Modified settings model)
  - `src/types/index.ts` (Modified `SystemSettings` type)
  - `src/utils/antiSpamHeaders.ts` (Updated fallback URL resolution)
  - `src/context/AppContext.tsx` (Wired settings into dispatch flow)
- **Scope Lock & Invariants:**
  - Do not modify user authentication logic or task queue state transitions.
  - Do not touch existing `AdminSettingsPage.tsx` (branding/database settings remain separate).
- **Verification Criteria:**
  - Navigate to `/vcon` -> "Content Settings" tab and verify all toggles and inputs save and load from database.
  - Dispatch a task with blank user unsubscribe URL; inspect headers and confirm `List-Unsubscribe: <https://unsubscribe.sotflo.com/unsubscribe?email=...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` are attached.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 2: Resend Tracking Deactivation & Dual-Runtime Provider Parity

- **Target Vulnerability:** Vulnerability 02 (Resend Tracking Phishing Flag & Cloudflare Pages SMTP Crash)
- **Primary Objective:**
  1. Pass `open_tracking: false` and `click_tracking: false` (or admin setting values) in Resend API dispatches in `server/providers/resend.ts` and `functions/api/[[catchall]].ts`.
  2. Prevent Resend from rewriting URLs into `resend.com/c/...`, eliminating the `#1` SpamAssassin and anti-phishing gateway penalty (`PHISH_URL_MISMATCH`).
  3. Update `functions/api/[[catchall]].ts` to gracefully handle Custom SMTP channels (routing cleanly or providing clear diagnostics, and binding `/api/send` alongside `/api/resend/send`).
- **Target Files:**
  - `server/providers/resend.ts`
  - `functions/api/[[catchall]].ts`
  - `server.ts`
  - `src/services/apiService.ts`
- **Scope Lock & Invariants:**
  - Do not alter the Nodemailer SMTP transport configuration in `server/providers/smtp.ts`.
  - Do not modify frontend UI components.
- **Verification Criteria:**
  - Verify Resend payload contains explicit tracking flags.
  - Test `/api/send` endpoint responsiveness in both Express and edge mock.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 3: Task Runner Exception Resilience & Recipient State Machine Immunity

- **Target Vulnerability:** Vulnerability 03 (Unhandled dispatch exceptions freeze recipients in `'sending'` state permanently; race condition on index mutation)
- **Primary Objective:**
  1. In `src/context/AppContext.tsx` (`runNextEmail`):
     - Wrap dispatch execution in a resilient state-machine handler: on any caught exception, immediately mark the recipient as `'failed'` with the exact error message.
     - Lookup recipients by immutable email address (`recs.findIndex(r => r.email === recipient.email)`) instead of stale closure index.
  2. Update `retryFailedRecipients` to reset both `'failed'` and any orphaned `'sending'` records back to `'pending'`.
  3. Ensure task progress and failure logs reflect actual execution status without manual page reload.
- **Target Files:**
  - `src/context/AppContext.tsx`
- **Scope Lock & Invariants:**
  - Do not change task database table schemas.
  - Do not alter the adaptive backoff algorithm for HTTP 429 rate limit responses.
- **Verification Criteria:**
  - Simulate an abrupt network disconnect or server 500 error; verify recipient is marked `'failed'`, error log appears in task card, and task runner proceeds to the next contact.
  - Verify "Retry Failed" successfully resets all failed contacts.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 4: S3/Supabase Attachment Streaming & Base64 Pipeline Sanitization

- **Target Vulnerability:** Vulnerability 04 (Silent attachment drops on client-side S3 CORS block; base64 header corruption)
- **Primary Objective:**
  1. Introduce a server-side attachment proxy endpoint (`GET /api/storage/attachment/:id` or cached buffer serving) to eliminate browser CORS restrictions.
  2. In `AppContext.tsx`, fetch attachments through the same-origin backend proxy if direct fetch fails, ensuring attachments are never silently dropped.
  3. In `server.ts` and `server/providers/smtp.ts`, sanitize all base64 attachment strings by stripping any leading `data:*;base64,` prefixes before passing to Resend and Nodemailer.
- **Target Files:**
  - `src/context/AppContext.tsx`
  - `server.ts`
  - `server/providers/smtp.ts`
  - `server/providers/resend.ts`
  - `server/storage.ts`
- **Scope Lock & Invariants:**
  - Do not modify S3 upload logic in `ContentPage.tsx`.
  - Do not touch Supabase credential management in `AdminStorageSettingsPage.tsx`.
- **Verification Criteria:**
  - Upload a PDF attachment and execute a dispatch; verify the email arrives with the PDF fully intact and readable.
  - Verify base64 files with data URL headers decode cleanly without corrupting the file header.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 5: Sender Identity Safeguard & RFC 5322 Display Name Quoting

- **Target Vulnerability:** Vulnerability 05 (Internal API key labels leak into email `From:` header; unquoted display names with commas cause header syntax errors)
- **Primary Objective:**
  1. In `src/context/AppContext.tsx`:
     - Remove the logic that substitutes `selectedApi.name` as `rawSenderName`.
     - Derive display names strictly from: (a) user-configured content name, (b) verified domain brand, (c) company name, or (d) clean neutral `"Support Team"`.
  2. In `server.ts` and `src/utils/antiSpamHeaders.ts`:
     - Enforce RFC 5322 Section 3.4 quoting: if a display name contains commas, semicolons, or quotes, format as `"${cleanName}" <${email}>`.
- **Target Files:**
  - `src/context/AppContext.tsx`
  - `server.ts`
  - `src/utils/antiSpamHeaders.ts`
- **Scope Lock & Invariants:**
  - Do not modify email interpolation of `{name}` or `{company}`.
  - Do not touch SMTP transport credentials.
- **Verification Criteria:**
  - Name an API key `"Test Key 99"`; dispatch an email and confirm the email `From:` header displays the company name or clean sender name, never `"Test Key 99"`.
  - Dispatch with display name `"Doe, John"`; verify outgoing header is formatted as `"Doe, John" <john@domain.com>`.
  - `npm run lint` and `npm run build` pass with 0 errors.
