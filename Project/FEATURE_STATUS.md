# ⚡ Feature Status & Implementation Matrix

**Document ID:** `FEATURE-STATUS-2026-09-26`  
**Application Target:** R Sender / X-Mailer Full-Stack Platform  
**Purpose:** Canonical tracking of all active production features, features planned for the 5-Phase Hardening Campaign, and verification status.

---

## 1. Active Working Features (Baseline State)

### 1.1 User & Admin Access
- [x] **First-Time Admin Setup Wizard (`/setup`):** Idempotent master admin provisioning with PBKDF2 cryptography and single-admin conflict protection.
- [x] **Administrative Console (`/vcon`):** Secure session token authentication, brute-force rate limiting (5 attempts / 60s lockout), system metrics, audit logs.
- [x] **User Authentication:** Password hash verification, account activation status checks, domain-level access restrictions.
- [x] **Account Password Management:** Secure self-service password update with old password verification.

### 1.2 Channel & Provider Orchestration
- [x] **Resend API Channels:** Key registration, domain verification lookup (`/domains`), daily limit tracking, usage progress indicators.
- [x] **Custom SMTP Channels:** Nodemailer integration with host, port, user, pass, SSL/TLS, and standalone handshake verification.
- [x] **Round-Robin Multi-Key Rotation:** Automatic key cycling across task-assigned channels with usage counters.
- [x] **Adaptive Rate Limit Backoff (Phase 6):** Automatic 3-attempt retry with progressive backoff on provider HTTP 429 errors.

### 1.3 Template & Content Engine
- [x] **Rich Editor & Dual-Part MIME:** HTML editor with automatic `htmlToPlainText` fallback conversion (RFC 2046 compliant).
- [x] **Preset Template Catalog:** System and custom presets stored in `neon_presets` with live preview and instant template loader.
- [x] **Dynamic Personalization Tags:** `{name}`, `{first_name}`, `{last_name}`, `{email}`, `{company}`, `{date}`, `{year}`, `{order_ref}`, `{ticket_id}`, `{random_code}`, `{R1-100}`, `{R1-100L}`.
- [x] **Deliverability & Anti-Phishing Scanner:** Real-time heuristic check for phishing phrases, spam words, capitalization ratio, and missing unsubscribes.

### 1.4 Task Execution & Dispatch
- [x] **Bulk Dispatch Queue:** Task creation with recipient parser (CSV upload or copy-paste), delay interval selector, start/pause/resume/stop controls.
- [x] **Live Progress Stream:** Monospace terminal log stream with level filtering, task search, and JSON export.
- [x] **Recipient Drill-Down Modal:** Searchable recipient table with status badges (`sent`, `failed`, `pending`, `sending`), message IDs, and CSV export.

---

## 2. Features Under Implementation (5-Phase Production Hardening)

| Feature | Target Phase | Status | Target Location | Description |
| :--- | :---: | :---: | :--- | :--- |
| **Admin Content Settings Page** | Phase 1 | `ACTIVE` | `src/components/admin/AdminContentSettingsPage.tsx` | Dedicated admin UI with master feature toggles and content configuration. |
| **Global Default Unsubscribe Fallback** | Phase 1 | `ACTIVE` | `server/db.ts`, `antiSpamHeaders.ts` | Default fallback (`https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}`) ensuring 100% RFC 8058 compliance. |
| **Master Resend Tracking Kill-Switch** | Phase 1 & 2 | `ACTIVE` | `AdminContentSettingsPage.tsx`, `server/providers/resend.ts` | Disables open/click tracking to prevent `resend.com/c/` link rewrites and phishing penalties. |
| **Dual-Runtime Provider Route Parity** | Phase 2 | `ACTIVE` | `functions/api/[[catchall]].ts`, `src/services/apiService.ts` | Unifies `/api/send` and `/api/resend/send` with graceful SMTP handling on Cloudflare edge. |
| **Resilient State Machine Error Trapping** | Phase 3 | `PLANNED` | `src/context/AppContext.tsx` | Traps dispatch exceptions, marks contacts as `'failed'`, and eliminates stuck `'sending'` status. |
| **Immutable Recipient Lookup** | Phase 3 | `PLANNED` | `src/context/AppContext.tsx` | Prevents race condition index drift by updating contacts by email instead of array index. |
| **Failed & Orphaned Recipient Retry** | Phase 3 | `PLANNED` | `src/context/AppContext.tsx` | Resets both `'failed'` and orphaned `'sending'` recipients back to `'pending'`. |
| **S3 Attachment Streaming Proxy** | Phase 4 | `PLANNED` | `server.ts`, `server/storage.ts` | Backend proxy eliminating browser CORS issues when fetching attachments. |
| **Base64 Attachment Data URL Stripper** | Phase 4 | `PLANNED` | `server.ts`, `server/providers/smtp.ts` | Cleans `data:*/*;base64,` prefixes to prevent binary file corruption. |
| **Sender Name Technical Leak Shield** | Phase 5 | `PLANNED` | `src/context/AppContext.tsx` | Prevents internal database labels from appearing in email `From:` headers. |
| **RFC 5322 Special Character Name Quoting** | Phase 5 | `PLANNED` | `server.ts`, `antiSpamHeaders.ts` | Wraps display names with commas in escaped quotes (`"Doe, John" <email>`). |

---

## 3. Post-Hardening Roadmap (Pending Future Scope)
- [ ] Automated bounce webhook listener (Resend inbound webhooks).
- [ ] Multi-tenant workspace teams and role-based permissions (manager, editor, dispatcher).
- [ ] Dedicated IP pool assignment per sender channel.
