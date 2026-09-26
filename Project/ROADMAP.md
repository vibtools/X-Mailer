# 🗺️ Production Execution Roadmap: 7-Phase Deliverability & Anti-Spam Hardening

**Document ID:** `ROADMAP-2026-09-26-7PHASE-EXECUTION`  
**Execution Strategy:** Strict Sequential Phased Delivery (Phase 1 through Phase 7)  
**Goal:** Completely eliminate the 7 root-cause deliverability vulnerabilities identified in `FORENSIC_AUDIT_REPORT.md` while maintaining 100% production readiness, zero regressions, and exact scope locks.  
**Baseline State:** `FROZEN AT 2026-09-26`

---

## High-Level 7-Phase Strategic Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: List-Unsubscribe Header Sanitation (Bug 01)                       │
│ ➔ Eliminate synthetic 404 URLs; enforce pure genuine HTTPS One-Click        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Identity & Sender Display Name Alignment (Bug 02)                  │
│ ➔ Remove hardcoded "Sarah from R Sender"; align sender names with domain     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Reply-To Route Protection & Dead Mailbox Elimination (Bug 03)       │
│ ➔ Stop auto-generating fake support@ subdomains; default to real sender     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Custom SMTP RFC 5322 Message-ID Generation (Bug 04)                │
│ ➔ Generate domain-aligned Message-ID; prevent cloud hostname leaks          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: MIME Multipart Body Fallback Hardening (Bug 05)                    │
│ ➔ Eliminate "Hello {name}" stub penalties; guarantee robust dual MIME       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: Rate Limiting & Resend 429 Adaptive Backoff (Bug 06)               │
│ ➔ Prevent spambot burst penalties; handle 429 rate limits gracefully        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 7: Custom SMTP TLS Security Hardening (Bug 07)                        │
│ ➔ Enforce strict TLS certificate verification by default for MTA-STS/DANE   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📌 Phase 1: List-Unsubscribe Header Sanitation & Fake URL Elimination
- **Target Vulnerability:** Bug 01 (RFC 8058 One-Click Unsubscribe 404 Probes)
- **Primary Objective:** Ensure outbound messages only contain genuine, valid HTTPS unsubscribe headers and never emit synthetic URLs that fail compliance probes.
- **Files to Modify:**
  - `src/utils/antiSpamHeaders.ts`
  - `functions/api/[[catchall]].ts`
- **Implementation Tasks:**
  1. Inspect `options.unsubscribeUrl`. If the user provided a non-empty, valid HTTPS URL, format and attach:
     - `List-Unsubscribe: <${cleanUrl}>`
     - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  2. If `options.unsubscribeUrl` is empty or unconfigured, do **NOT** fabricate `https://${domain}/unsubscribe?email=...`.
  3. Ensure zero synthetic `mailto:unsubscribe@${domain}` strings are generated.
- **Scope Lock & Invariants:**
  - Do not modify subject or body interpolation.
  - Do not change recipient lists or task execution order.
- **Verification Criteria:**
  - Unit test verifying header output when `unsubscribeUrl` is present vs. empty.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 2: Sender Display Name & Identity Mismatch Elimination
- **Target Vulnerability:** Bug 02 (Hardcoded "Sarah from R Sender" & "R Sender Support")
- **Primary Objective:** Eradicate all hardcoded fallback names and subjects that trigger brand/identity mismatches on custom business domains.
- **Files to Modify:**
  - `server.ts`
  - `src/context/AppContext.tsx`
  - `src/components/pages/TasksPage.tsx`
- **Implementation Tasks:**
  1. In `src/context/AppContext.tsx` (`runNextEmail`):
     - If `senderName` is omitted in the task/content, derive it from:
       (a) The active API channel's `name`, or
       (b) The local user part of the sender email (e.g. `billing` from `billing@domain.com`), or
       (c) System configured `companyName`.
     - Remove `'Sarah from R Sender'` and `'R Sender'`.
  2. In `src/components/pages/TasksPage.tsx`:
     - Change default fallback sender name from `'R Sender Support'` to the active API key name.
  3. In `server.ts`:
     - Clean up seed/fallback data in `/api/content` to eliminate `"Sarah from R Sender"`.
- **Scope Lock & Invariants:**
  - Do not alter the task queue state machine or database schemas.
  - Do not modify the UI styling of the tasks page.
- **Verification Criteria:**
  - Dispatch test email with blank sender name; verify outgoing `From` header displays proper business name or API name.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 3: Reply-To Route Protection & Dead Mailbox Callout Elimination
- **Target Vulnerability:** Bug 03 (Synthetic `support@${senderDomain}` causing MX probe 550 errors)
- **Primary Objective:** Guarantee that Reply-To headers never point to non-existent mailboxes; default cleanly to the authenticated sender address if unconfigured.
- **Files to Modify:**
  - `src/utils/antiSpamHeaders.ts`
  - `functions/api/[[catchall]].ts`
- **Implementation Tasks:**
  1. In `resolveAutoReplyTo`:
     - If user specified an external Reply-To address (e.g. `support@gmail.com` or `helpdesk@company.com`), preserve it 100% untouched.
     - If user left Reply-To empty, default to `senderBareEmail` (the actual sender address).
     - Completely eliminate the fallback line `return senderDomain && senderDomain !== 'resend.dev' ? support@${senderDomain} : undefined`.
  2. Synchronize Cloudflare Pages edge runtime in `functions/api/[[catchall]].ts` with identical logic.
- **Scope Lock & Invariants:**
  - Do not change From header or To header.
  - Do not alter sanitization logic in `sanitizeReplyTo`.
- **Verification Criteria:**
  - Verify Reply-To output when empty equals `senderBareEmail`.
  - Verify external custom emails remain untouched.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 4: Custom SMTP RFC 5322 Message-ID Generation
- **Target Vulnerability:** Bug 04 (Internal cloud hostname leak in SMTP Message-ID)
- **Primary Objective:** Generate an RFC 5322 compliant `Message-ID` header using the sender's authenticated domain, eliminating `MSGID_FROM_MTA_HEADER` penalties.
- **Files to Modify:**
  - `server/providers/smtp.ts`
- **Implementation Tasks:**
  1. In `server/providers/smtp.ts` (`sendMail`):
     - Extract the sender domain from `payload.from` (or `channel.sender_email`).
     - Generate a cryptographically secure, unique Message-ID:
       `const messageId = <${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${senderDomain}>;`
     - Attach `messageId` to Nodemailer's `mailOptions`.
     - If user passes a custom `Message-ID` in `payload.headers`, preserve the user's header.
- **Scope Lock & Invariants:**
  - Do not alter SMTP credentials or socket connection parameters.
  - Do not touch Resend provider logic.
- **Verification Criteria:**
  - Verify outgoing SMTP email contains properly formatted `<timestamp.hex@senderdomain>`.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 5: MIME Multipart Body Fallback Hardening
- **Target Vulnerability:** Bug 05 (Stub body penalties: "Hello {name}", "Notification from R Sender")
- **Primary Objective:** Prevent sending messages with stub or empty bodies that trigger SpamAssassin `EMPTY_MESSAGE` and `SHORT_BODY` rules.
- **Files to Modify:**
  - `server.ts`
  - `src/context/AppContext.tsx`
- **Implementation Tasks:**
  1. In `AppContext.tsx` (`runNextEmail`):
     - If `finalHtml` is present but `finalText` is empty, auto-generate `finalText` using `htmlToPlainText(finalHtml)`.
     - If both `finalHtml` and `finalText` are empty, log an error and skip/halt rather than injecting `"Hello {name}"`.
  2. In `server.ts` (`/api/resend/send` & `/api/smtp/send`):
     - If HTML is provided and text is omitted, auto-generate text from HTML using the server-side text stripper.
     - Reject requests that have zero body content with HTTP 400 Bad Request instead of defaulting to `"Notification from R Sender"`.
- **Scope Lock & Invariants:**
  - Do not modify user's HTML template content or formatting.
  - Do not alter the editor UI.
- **Verification Criteria:**
  - Send HTML-only email; verify dual multipart MIME text is generated automatically.
  - Send empty body request; verify clean validation error without sending spam stubs.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 6: Rate Limiting & Resend 429 Adaptive Backoff
- **Target Vulnerability:** Bug 06 (Spambot burst rate penalties & Resend 429 failures)
- **Primary Objective:** Implement adaptive retry/backoff for Resend API rate limits (HTTP 429) and safe default task pacing.
- **Files to Modify:**
  - `src/context/AppContext.tsx`
  - `server.ts`
- **Implementation Tasks:**
  1. In `src/context/AppContext.tsx` (`runNextEmail`):
     - Detect HTTP 429 `rate_limit_exceeded` responses from the dispatch API.
     - When a 429 occurs, pause the task queue for an adaptive backoff window (e.g. 3000ms), and retry the current recipient (up to 3 attempts) rather than instantly marking them failed.
     - Log a clear informational message in live logs: `"Rate limit encountered. Backing off for 3s before retry..."`.
  2. Ensure default task creation delay in `server.ts` defaults to 3000ms.
- **Scope Lock & Invariants:**
  - Do not alter the recipient CSV parser or task data structure.
  - Retain user ability to customize delays in task creation.
- **Verification Criteria:**
  - Simulate 429 response; verify queue pauses and retries smoothly without dropping recipients.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## 📌 Phase 7: Custom SMTP TLS Security Hardening
- **Target Vulnerability:** Bug 07 (Insecure TLS `rejectUnauthorized: false` flag)
- **Primary Objective:** Enforce strict SSL/TLS certificate verification by default for custom SMTP connections to meet MTA-STS and DANE security standards.
- **Files to Modify:**
  - `server/providers/smtp.ts`
  - `server.ts`
- **Implementation Tasks:**
  1. In `server/providers/smtp.ts`:
     - Update transporter configuration to set `rejectUnauthorized: true` by default.
     - Allow `rejectUnauthorized: false` only if the user explicitly passes an `ignoreTlsErrors: true` flag for private/self-signed testing.
  2. In `server.ts` (`/api/smtp/verify`):
     - Ensure probe verification tests real SSL/TLS certificates and reports certificate validation status.
- **Scope Lock & Invariants:**
  - Do not break standard port 465 (SSL) and port 587 (STARTTLS) connection handling.
  - Ensure zero impact on Resend API channels.
- **Verification Criteria:**
  - Verify TLS handshake succeeds with strict certificate validation against standard mail relays.
  - `npm run lint` and `npm run build` pass with 0 errors.

---

## Acceptance Criteria Across All Phases
1. **Zero Fake/Mock Policy (Rule 01):** All logic must be 100% real, functional, and production-tested.
2. **Scope Discipline:** Only touch the exact files specified in each phase's scope lock.
3. **No Breaking Changes:** Zero regressions in existing features, UI, or database operations.
4. **Verification:** Every phase must pass `tsc --noEmit` and `compile_applet` before progressing to the next.
