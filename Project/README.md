# 📚 Project Documentation & Engineering Index

Welcome to the internal engineering documentation directory for **R Sender**. This directory maintains the forensic audit reports, architectural specifications, delivery compliance guidelines, multi-phase execution roadmaps, and feature status matrices for the platform.

---

## 📁 Directory Structure & Document Navigation

| File | Title | Description | Current Status |
| :--- | :--- | :--- | :---: |
| **`FORENSIC_AUDIT_REPORT.md`** | **Forensic Deliverability Audit & Bug Proofs** | Detailed technical analysis of the 7 active deliverability bugs (RFC 8058 fake URLs, hardcoded "Sarah" sender name, synthetic `support@` reply-to, SMTP Message-ID domain mismatch, stub body text, unthrottled velocity/429 limits, and insecure SMTP TLS flag) with code locations, harm analysis, and exact Scope Locks. | `LOCKED FOR EXECUTION` |
| **`ROADMAP.md`** | **Production Delivery Roadmap (7 Phases)** | Strict, sequential 7-Phase execution plan designed to systematically eliminate all 7 deliverability bugs with zero regressions. | `APPROVED BASELINE` |
| **`PHASE_TRACKER.md`** | **Phase Execution & Completion Tracker** | Real-time tracking log recording completed phases (0/7), pending phases (7/7), scope locks, and detailed progress logs. | `BASELINE FROZEN (0/7)` |
| **`ERROR_HANDLING.md`** | **Error Handling & Fault Resilience Architecture** | Comprehensive audit of existing error handling across Express, Cloudflare Functions, and React AppContext, plus new defensive guards to be implemented across all 7 phases. | `COMPLETE` |
| **`FEATURE_STATUS.md`** | **Feature Working Status & Delivery Matrix** | Detailed matrix of all current working features, baseline frozen state, and phase-by-phase feature additions. | `ACTIVE` |

---

## 🎯 Target Deliverability Bugs Summary (The 7 Phases)

1. **Phase 1 (Bug 01) — Synthetic `List-Unsubscribe` URL Generation (RFC 8058 Violation):**
   - **Root Cause:** Generates `https://${domain}/unsubscribe?email=...` where no backend route exists. Google/Yahoo automated POST probes fail with 404, triggering RFC Deceptive Header flags.
   - **Remediation:** Only emit `List-Unsubscribe` if genuine HTTPS URL is supplied; never synthesize fake endpoints; eradicate dead `mailto:`.
2. **Phase 2 (Bug 02) — Hardcoded Fallback Sender Name & Subject ("Sarah from R Sender"):**
   - **Root Cause:** When sender name is blank, falls back to `"Sarah from R Sender"` or `"R Sender Support"`, triggering Brand/Identity Mismatch on custom domains.
   - **Remediation:** Remove hardcoded stubs; resolve display name dynamically from API channel name, company name, or authenticated sender address.
3. **Phase 3 (Bug 03) — Synthetic `support@domain.com` Auto Reply-To (MX Callout Failure):**
   - **Root Cause:** Generates `support@${senderDomain}` when Reply-To is empty, failing receiving MTA MX callout probes with 550 Mailbox Not Found.
   - **Remediation:** Default empty Reply-To to actual authenticated sender email (`senderBareEmail`); preserve external custom Reply-To untouched.
4. **Phase 4 (Bug 04) — Custom SMTP `Message-ID` Domain Mismatch:**
   - **Root Cause:** Missing Message-ID generator in SMTP provider leaks server machine hostnames (`@run.app` or `@localhost`), triggering `MSGID_FROM_MTA_HEADER` penalties.
   - **Remediation:** Generate RFC 5322 compliant Message-ID using the sender's authenticated domain (`<timestamp.random@senderdomain>`).
5. **Phase 5 (Bug 05) — Stub Body Text Fallback ("Hello {name}", "Notification from R Sender"):**
   - **Root Cause:** Injects generic stubs when body is empty, triggering SpamAssassin `EMPTY_MESSAGE` and `SHORT_BODY` rules.
   - **Remediation:** Auto-generate plain text from HTML via `htmlToPlainText`; reject empty body dispatches with HTTP 400.
6. **Phase 6 (Bug 06) — Rapid Velocity Bursts & Resend 429 Rate Limits:**
   - **Root Cause:** Sub-second task delays trigger automated spambot rate-limiters and unhandled Resend 429 errors.
   - **Remediation:** Implement adaptive 3s backoff retry for 429 responses; enforce safe 3000ms+ default delay.
7. **Phase 7 (Bug 07) — Custom SMTP TLS `rejectUnauthorized: false` Flag:**
   - **Root Cause:** Insecure TLS flag disables certificate validation, tripping strict MTA-STS and DANE security policies.
   - **Remediation:** Enforce strict certificate verification (`rejectUnauthorized: true`) by default for all standard production SMTP ports.
