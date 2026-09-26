# 📜 Changelog — X-Mailer

All notable changes to the **X-Mailer** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-09-26

### 🛡️ Deliverability Hardening Suite (7-Phase Campaign)
- **RFC 8058 One-Click Unsubscribe**: Automatic generation of genuine HTTPS `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers, eliminating synthetic 404 URLs.
- **Sender Display Name Alignment**: Replaced hardcoded fallback names with dynamic identity derivation from active API channels, verified sender emails, and company configurations.
- **Reply-To Route Protection**: Defaulted empty Reply-To to authenticated sender email, eliminating synthetic `support@` MX probe failures.
- **RFC 5322 Custom Message-ID Generator**: Implemented cryptographic, sender-domain aligned Message-IDs (`<timestamp.pid.rand@senderdomain>`), eliminating cloud container hostname leaks.
- **Dual-Part MIME Auto-Converter**: Auto-generates clean plain-text alternatives from HTML bodies (RFC 2046), with HTTP 400 rejection for empty body dispatches.
- **Adaptive 429 Rate Limiter & Backoff Engine**: Automated 3-stage backoff retry on Resend / SMTP rate limits with live logging.
- **Strict TLS 1.2+ Security Hardening**: Enforced mandatory TLS certificate validation (`rejectUnauthorized: true`) on custom SMTP transports.

---

## [1.0.0] — 2026-09-24

### 🚀 Initial Production Release
- **Multi-Key Resend API Dispatcher**: Intelligent round-robin key rotation across unlimited Resend API keys with automatic failure isolation.
- **Dual Runtime Deployment**:
  - Serverless Cloudflare Pages Functions (`functions/api/[[catchall]].ts`) with `@neondatabase/serverless`.
  - Node.js Express server (`server.ts`) with standard `pg` connection pooling.
- **Edge IP Address & Datacenter Detection**: Live User Dashboard card showing connecting IP address (`cf-connecting-ip`) and Cloudflare colocation airport code.
- **Dynamic Platform Branding & Favicon Engine**: S3 media storage upload, SVG/emoji favicon generation, and universal multi-panel logo propagation.
- **One-Click Setup Wizard (`/setup`)**: Automated database connectivity diagnostic, schema migrations, and admin onboarding.
- **Enterprise Security Suite**: PBKDF2 SHA-512 password hashing, brute-force exponential lockouts, and JWT session tokens.
- **Neon PostgreSQL Persistence Layer**: 9 normalized relational tables for users, tasks, APIs, content, and audit logs.

---

## Maintainers

- **Organization:** [Vib Tools](https://vib.tools/)
- **Maintainer:** Md Nurnobi ([@victorsteele](https://github.com/victorsteele))
