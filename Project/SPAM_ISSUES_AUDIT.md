# 📬 Deliverability & Spam Issues Forensic Deep Dive

**Document ID:** `SPAM-AUDIT-2026-09-26`  
**Application Target:** R Sender / X-Mailer Full-Stack Platform  
**Focus:** Mailbox Provider Heuristics (Google Workspace, Yahoo Mail, Microsoft 365), SpamAssassin Scoring, and RFC Compliance Standards.

---

## 1. Why Bulk Emails Land in the Spam Folder: The Root Causes

Deliverability in modern email environments (2024–2026) is determined by automated compliance filters, machine learning NLP scanners, and domain reputation telemetry. The recent forensic audit identified the primary triggers currently active in the codebase:

### 1.1 Trigger 1: Missing RFC 8058 One-Click List-Unsubscribe Header
- **Standard:** RFC 8058 & RFC 2369.
- **Provider Mandate:** Google and Yahoo (effective February 2024) enforce mandatory One-Click Unsubscribe headers for all high-volume and bulk senders.
- **Why It Causes Spam:**
  When a message lacks `List-Unsubscribe: <https://...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, mail clients cannot render the native "Unsubscribe" button in the client toolbar.
  When recipients who no longer wish to receive communication cannot easily unsubscribe, their only option is to click **"Report as Spam"**.
  If a sender's spam complaint rate exceeds **0.3%** (3 reports per 1,000 deliveries), Google's postmaster algorithms automatically throttle delivery and redirect all future messages to Spam.
- **The Code Flaw:** In `src/utils/antiSpamHeaders.ts`, if the user does not specify a custom unsubscribe URL, the engine outputs no `List-Unsubscribe` header at all.
- **The Fix (Phase 1):** Provide a global fallback URL (`https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}`) managed via Admin Content Settings, ensuring every single dispatch carries valid RFC 8058 headers.

---

### 1.2 Trigger 2: Tracking Domain Mismatch (Phishing Link Obfuscation)
- **Standard:** Anti-Phishing Heuristic (SpamAssassin rule `PHISH_URL_MISMATCH`).
- **Why It Causes Spam:**
  By default, transactional API providers like Resend rewrite all hyperlinks in the email body into their own domain redirects (e.g. `https://resend.com/c/...` or `https://click.resend.dev/...`) and insert an open-tracking pixel (`<img src="https://resend.com/o/...">`).
  Security gateways (Proofpoint, Microsoft Defender 365, Mimecast) analyze the sender domain vs. link destination:
  - Sender: `billing@mycompany.com`
  - Links: `https://resend.com/c/3a4b5c...`
  Because thousands of other accounts send through `resend.com`, any bad actor using the shared tracking domain contaminates its reputation. When corporate gateways detect a mismatch between the sender domain and the link domain, they assign a heavy **Phishing Link Obfuscation** penalty, routing the message to Junk or quarantine.
- **The Code Flaw:** Neither `server/providers/resend.ts` nor `functions/api/[[catchall]].ts` passed `open_tracking: false` or `click_tracking: false` to Resend.
- **The Fix (Phase 2):** Implement a master toggle in Admin Content Settings and explicitly pass `open_tracking: false` and `click_tracking: false` to Resend API payloads, preserving original domain URLs.

---

### 1.3 Trigger 3: Technical API Key Label Leaks in the `From:` Header
- **Standard:** RFC 5322 Section 3.4 (Mailbox Specification).
- **Why It Causes Spam:**
  When `rawSenderName` matches placeholder defaults, `AppContext.tsx` overrides it with `selectedApi.name`. If an administrator labels their key `"Resend Production Key 03"`, recipients see:
  `From: Resend Production Key 03 <notifications@company.com>`.
  Recipients immediately perceive internal infrastructure labels as suspicious, automated spam bots or unauthorized spoofing, leading to immediate spam flagging.
- **The Code Flaw:** `AppContext.tsx` lines 709–713 replaces empty sender names with `selectedApi.name`.
- **The Fix (Phase 5):** Disconnect internal API labels from public display names; derive display names strictly from company name or authenticated domain.

---

### 1.4 Trigger 4: Unquoted Special Characters in Sender Display Names
- **Standard:** RFC 5322 Section 3.4.
- **Why It Causes Spam:**
  If a sender name contains a comma, semicolon, or colon (e.g. `Smith, John`), RFC 5322 mandates that the display name must be an enclosed quoted-string:
  `"Smith, John" <john@company.com>`.
  If left unquoted (`Smith, John <john@company.com>`), the parser interprets `"Smith"` and `"John <john@company.com>"` as two separate addresses. Many MTAs reject the message outright (`501 5.1.7 Bad sender address syntax`) or flag it with SpamAssassin `FROM_EXCESS_COMA`.
- **The Code Flaw:** `server.ts` does not wrap display names containing commas in quotes.
- **The Fix (Phase 5):** Auto-quote display names containing special characters.

---

### 1.5 Trigger 5: Duplicate Sends Due to In-Flight Browser State Loss
- **Why It Causes Spam:**
  If a 500-recipient task is interrupted at recipient 300 (due to a browser crash, refresh, or power loss) and in-flight updates were not flushed to the database, restarting the task dispatches duplicate emails to the first 300 contacts.
  Recipients receiving identical messages within minutes almost invariably click **"Report Spam"**.
- **The Code Flaw:** `updateTask` in `AppContext.tsx` debounces updates and only forces DB save on task completion (`stats.remaining === 0`).
- **The Fix (Phase 3):** Resilient state-machine updates and periodic milestone flushes ensure progress is reliably recorded in PostgreSQL.

---

## 2. Deliverability Scoring Matrix Before & After Remediation

| Deliverability Factor | Baseline State (Before) | Post-Remediation State (After 5 Phases) |
| :--- | :--- | :--- |
| **RFC 8058 One-Click Header** | Missing if user leaves URL blank (Google/Yahoo penalty) | 100% Guaranteed via Admin Default Unsubscribe Fallback |
| **Link Obfuscation / Phishing** | Active (Resend rewrites links to `resend.com/c/`) | Eliminated (Direct domain URLs with tracking disabled) |
| **Sender Name Authenticity** | Internal technical API labels leak into `From:` | Clean business identity; technical labels never leak |
| **From Header Syntax** | Unquoted commas cause RFC 5322 syntax errors | Fully quoted RFC 5322 compliance (`"Last, First" <email>`) |
| **Attachment Integrity** | Dropped silently if S3 bucket lacks CORS | Guaranteed delivery via same-origin backend proxy |
| **Task Failure Recovery** | Exceptions leave contacts stuck in `'sending'` forever | Contacts marked `'failed'`, fully retryable with single click |
