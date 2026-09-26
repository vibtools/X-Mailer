<div align="center">

# ✉️ X-Mailer

### High-Throughput Multi-Provider Email Automation Platform & Deliverability Engine

**A modern, production-grade email orchestration platform featuring multi-key round-robin rotation, dual-runtime edge deployment (Cloudflare Pages + Node.js Express), custom SMTP connection pooling with TLS 1.2+ security, automated RFC 8058 One-Click Unsubscribe, DMARC alignment guard, dynamic multi-variable templating, and Neon PostgreSQL persistence.**

<br />

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Runtime](https://img.shields.io/badge/runtime-Node.js%20%7C%20Cloudflare%20Pages%20Functions-orange.svg)]()
[![Database](https://img.shields.io/badge/database-Neon%20PostgreSQL-00e599.svg)]()
[![Email Providers](https://img.shields.io/badge/providers-Resend%20API%20%7C%20Custom%20SMTP-000000.svg)]()
[![Deliverability Standards](https://img.shields.io/badge/deliverability-RFC%208058%20%7C%20RFC%205322%20%7C%20DMARC%20Guard-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-3178c6.svg)]()
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4.0-38bdf8.svg)]()
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](./LICENSE)
[![Maintained by Vib Tools](https://img.shields.io/badge/maintained%20by-Vib%20Tools-6366f1.svg)](https://vib.tools/)

<br />

[Features](#-key-features-a-z) • [Architecture](#-system-architecture) • [Deliverability Engine](#-enterprise-deliverability-engine) • [Quick Start](#-quick-start) • [Cloudflare Deployment](#-cloudflare-pages-deployment-guide) • [API Reference](#-api-endpoints-reference) • [Documentation](#-project-documentation) • [Author & Company](#-author--company)

</div>

---

## 🌟 Executive Summary

**X-Mailer** is an open-source, full-stack email automation and bulk dispatch engine developed by **Vib Tools**. Built to overcome API rate limitations, cold email deliverability hurdles, and server-side hostname leaks, X-Mailer empowers developers, growth teams, and businesses to orchestrate high-deliverability email campaigns effortlessly.

With support for both **Resend REST API multi-key round-robin rotation** and **custom SMTP connection pools with strict TLS 1.2+ certificate validation**, X-Mailer eliminates single points of failure, mitigates spam classification via RFC compliance, and guarantees zero-downtime execution across **Cloudflare Pages edge networks** or standalone **Docker / VPS environments**.

---

## ✨ Key Features (A to Z)

| Feature | Category | Description |
| :--- | :--- | :--- |
| **Adaptive 429 Rate Limiting** | Dispatch Engine | Automatic progressive backoff (up to 3 retries) when email providers return `429 Too Many Requests`. |
| **Admin Console (`/vcon`)** | Administration | Comprehensive administrative dashboard for managing API channels, system settings, audit logs, and users. |
| **Attachment Caching (In-Memory)** | Performance | Pre-fetches and encodes base64 attachments once per campaign, eliminating redundant storage requests. |
| **Authentication & RBAC** | Security | PBKDF2 SHA-512 cryptographic password hashing (100,000 iterations) with separate Admin and User roles. |
| **Brand Identity & Favicon Sync** | UI / UX | Dynamic SVG/emoji favicon generation in the browser DOM and custom logo upload with S3 storage. |
| **Brute-Force Rate Limiting** | Security | Exponential lockout on repeated failed login attempts to safeguard administrative endpoints. |
| **Cloudflare Edge Resolution** | Networking | Detects client IP (`cf-connecting-ip`), ISP network details, and edge colocation airport code (e.g., `DHK`, `SIN`, `FRA`). |
| **Custom SMTP Engine** | Connectivity | Full SMTP connection pooling with strict TLS certificate verification (`rejectUnauthorized: true`) and STARTTLS. |
| **Deliverability DMARC Guard** | Compliance | Pre-flight check preventing unauthenticated dispatches or obsolete sandbox addresses from hurting domain reputation. |
| **Dual-Part MIME Conversion** | Compliance | Converts rich HTML into clean plain-text alternatives automatically (RFC 2046), eliminating empty-body spam penalties. |
| **Dual-Runtime Deployment** | Architecture | Identical feature parity across serverless Cloudflare Pages Functions and Node.js Express servers. |
| **Dynamic Multi-Tag Interpolation** | Personalization | Real-time tag replacements in subject and body: `{name}`, `{email}`, `{company}`, `{sender_name}`, `{sender_domain}`, `{date}`, `{year}`, `{random_code}`, `{order_ref}`, `{R1-100}`, and `{R1-100L}`. |
| **High-Performance Grid & Analytics** | UI / UX | Live campaign throughput tracker, recipient progress bar, send velocity, and granular delivery status audit. |
| **List-Unsubscribe RFC 8058** | Compliance | Emits genuine `List-Unsubscribe: <https://...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. |
| **Message-ID RFC 5322 Engine** | Compliance | Generates domain-aligned cryptographic Message-IDs (`<timestamp.pid.rand@senderdomain>`) to prevent cloud host leaks. |
| **Multi-Key Round-Robin** | Dispatch Engine | Disperses campaign loads across dozens of API keys dynamically, multiplying throughput and quota limits. |
| **Neon PostgreSQL Persistence** | Storage | Fully normalized relational persistence with automated schema migrations for users, APIs, tasks, and audit logs. |
| **One-Click Setup Wizard (`/setup`)** | Onboarding | Automated database connectivity check, latency diagnostic, table provisioning, and initial admin onboarding. |
| **Recipient Windowing** | Performance | Handles campaigns with 50,000+ recipients with smooth UI rendering and chunked execution. |
| **Reply-To Route Protection** | Compliance | Eliminates synthetic/dead mailboxes by defaulting Reply-To to authenticated sender addresses or verified custom targets. |
| **Single Send REST API** | Developer Tools | Programmatic `/api/send/single` endpoint for transactional emails, webhooks, and third-party integrations. |
| **Strict Zero-Mock Policy** | Engineering | 100% production-ready logic with zero fake delays, mock arrays, or simulated network calls. |
| **Supabase S3 Storage Driver** | Storage | Direct AWS S3 compliant media storage for campaign attachments, logos, and generated assets. |
| **Universal Dark/Light Theme** | UI / UX | Clean, accessible, modern UI engineered with Tailwind CSS and smooth framer-motion micro-interactions. |

---

## 🛡️ Enterprise Deliverability Engine

X-Mailer incorporates an active, 7-tier deliverability hardening matrix to ensure your messages land in the **Primary Inbox**, avoiding spam filters and quarantine:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       X-MAILER DELIVERABILITY SUITE                         │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 1. RFC 8058 List-Unsubscribe  │ Genuine HTTPS One-Click unsubscribe headers │
│ 2. Dynamic Sender Alignment   │ Eliminates hardcoded brand identity mismatch│
│ 3. Reply-To Route Protection  │ Prevents dead mailbox MX probe rejections   │
│ 4. RFC 5322 Custom Message-ID │ Eliminates cloud container hostname leaks   │
│ 5. Dual-Part MIME Fallback    │ Auto-generates text/plain from HTML body    │
│ 6. Adaptive 429 Backoff Engine│ Auto-retries throttled emails gracefully    │
│ 7. Strict TLS 1.2+ SMTP Trust │ Enforces secure, verified transport layers  │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 🏗️ System Architecture

X-Mailer utilizes a **Dual-Runtime Universal Architecture** ensuring consistent execution regardless of your hosting provider:

```text
                                  ┌─────────────────────────────┐
                                  │     Frontend Client SPA     │
                                  │   React 19 + Tailwind CSS   │
                                  └──────────────┬──────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        │                                                 │
            [ Edge / Serverless ]                               [ VPS / Container ]
                        ▼                                                 ▼
       ┌───────────────────────────────────┐             ┌───────────────────────────────────┐
       │   Cloudflare Pages Edge Network   │             │       Node.js Express Server      │
       │    functions/api/[[catchall]]     │             │             server.ts             │
       │   (@neondatabase/serverless)      │             │        (pg Connection Pool)       │
       └─────────────────┬─────────────────┘             └─────────────────┬─────────────────┘
                         │                                                 │
                         └────────────────────────┬────────────────────────┘
                                                  │
                        ┌─────────────────────────┼─────────────────────────┐
                        ▼                         ▼                         ▼
              ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
              │  Neon PostgreSQL  │     │ Resend / SMTP API │     │    Supabase S3    │
              │  Relational DB    │     │ Dispatch Pipeline │     │   Media Storage   │
              └───────────────────┘     └───────────────────┘     └───────────────────┘
```

---

## ⚡ Tech Stack

- **Frontend Framework:** React 19 (SPA), TypeScript, Vite
- **Styling & Animation:** Tailwind CSS v4, Motion (Framer Motion), Lucide Icons
- **Edge Backend:** Cloudflare Pages Functions (`@cloudflare/workers-types`, `@neondatabase/serverless`)
- **Server Backend:** Node.js, Express, `pg` (PostgreSQL Connection Pooling), `nodemailer`
- **Database:** Neon Serverless PostgreSQL
- **Storage:** Supabase Storage (AWS S3 SDK Client)
- **Email Infrastructure:** Resend REST API & RFC-compliant Custom SMTP

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/vibtools/x-mailer.git
cd x-mailer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the sample environment file and configure your database and secrets:
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Database Connection (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@ep-cool-project-123456.us-east-2.aws.neon.tech/neondb?sslmode=require

# Authentication Security (Generate a 32+ character random string)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Server Port (Default: 3000)
PORT=3000
```

### 4. Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. If running for the first time, you will be redirected to the **`/setup`** wizard to initialize the database and create your master administrator credentials.

---

## ☁️ Cloudflare Pages Deployment Guide

X-Mailer is optimized for 1-click serverless deployment on **Cloudflare Pages**.

### Step 1: Connect GitHub Repository
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your `x-mailer` repository and click **Begin setup**.

### Step 2: Configure Build Settings
- **Framework preset:** `None` (or `Vite`)
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `/`

### Step 3: Enable Node.js Compatibility Flag
Under **Settings** > **Functions** > **Compatibility flags**:
- Add `nodejs_compat` to **Production compatibility flags**.
- Set **Compatibility date** to `2024-09-23` or newer.

### Step 4: Add Environment Variables
Under **Settings** > **Environment variables**, define:
- `DATABASE_URL`: Your Neon PostgreSQL connection string.
- `JWT_SECRET`: A secure random string for JWT token verification.

### Step 5: Deploy & Initialize
Click **Save and Deploy**. Once deployed, visit `https://<your-project>.pages.dev/setup` to complete the database initialization.

---

## 📡 API Endpoints Reference

### Authentication & Account
- `POST /api/auth/login` — Standard user authentication with PBKDF2 verification.
- `POST /api/auth/admin-login` — Administrator authentication for `/vcon` console.
- `GET /api/auth/me` — Retrieve active session profile.

### Single Dispatch (Transactional API)
- `POST /api/send/single` — Programmatic transactional email dispatcher.
  ```json
  {
    "from": "Support <support@yourdomain.com>",
    "to": "customer@example.com",
    "subject": "Order Confirmation",
    "html": "<p>Hello {name}, your order is confirmed!</p>",
    "replyTo": "help@yourdomain.com",
    "channelId": "optional-channel-id"
  }
  ```

### Platform Management
- `GET /api/apis` — List configured Resend API keys and SMTP channels.
- `POST /api/apis` — Create or rotate email provider channels.
- `GET /api/tasks` — List bulk email automation tasks and live statistics.
- `POST /api/tasks` — Create, pause, resume, or abort bulk campaign tasks.
- `GET /api/ip` — Real-time Cloudflare edge IP resolution and colocation diagnostic.

---

## 📚 Project Documentation

For comprehensive technical guides, consult our documentation suite:

- 🏛️ **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Forensic system design, data models, state workflows, and RFC compliance.
- 🚀 **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Production deployment workflows for Cloudflare Pages, Docker, VPS, and Railway.
- 🤝 **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contribution standards, strict zero-mock policy, and PR checklist.
- 🔒 **[SECURITY.md](./SECURITY.md)** — Cryptography details, vulnerability disclosure policy, and security practices.
- 📜 **[CHANGELOG.md](./CHANGELOG.md)** — Historical release notes and milestone breakdown.

---

## 👨‍💻 Author & Company

### Company / Organization
**Vib Tools**  
*Practical software for real workflows.*

- **Official Website:** [https://vib.tools/](https://vib.tools/)
- **GitHub Organization:** [@vibtools](https://github.com/vibtools)
- **GitLab Organization:** [@vibtools](https://gitlab.com/vibtools)
- **Headquarters:** 5660 Kochakata, Nageswari, Kurigram, Rangpur, Bangladesh
- **General Inquiries:** [hello@vib.tools](mailto:hello@vib.tools)
- **Technical Support:** [support@vib.tools](mailto:support@vib.tools)
- **Phone / WhatsApp:** [+880 1795-470603](https://wa.me/8801795470603)

### Connected Maintainer
**Md Nurnobi**  
- **GitHub:** [@victorsteele](https://github.com/victorsteele)  
- **Email:** [victorsteele428@gmail.com](mailto:victorsteele428@gmail.com)

---

## 📄 License

This project is open-source software licensed under the **[MIT License](./LICENSE)**.  
Copyright © 2026 **Vib Tools** & **Md Nurnobi**.
