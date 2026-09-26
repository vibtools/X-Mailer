# 🏛️ System Architecture & Forensic Audit — X-Mailer

**Project Name:** X-Mailer  
**Maintained By:** [Vib Tools](https://vib.tools/)  
**Primary Maintainer:** Md Nurnobi ([@victorsteele](https://github.com/victorsteele))  
**License:** MIT  

This document outlines the internal architecture, dual-runtime dispatch execution models, data models, state workflows, and deliverability security design of **X-Mailer**.

---

## 📑 Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Dual-Runtime Execution Model](#2-dual-runtime-execution-model)
3. [Component Hierarchy & State Management](#3-component-hierarchy--state-management)
4. [Bulk Dispatch & Rotation Pipeline](#4-bulk-dispatch--rotation-pipeline)
5. [RFC & Deliverability Hardening Engine](#5-rfc--deliverability-hardening-engine)
6. [Database Schema & Migration Layer](#6-database-schema--migration-layer)
7. [Security & Cryptography Framework](#7-security--cryptography-framework)
8. [Edge IP & Networking Flow](#8-edge-ip--networking-flow)
9. [Forensic Code Quality & Zero-Mock Compliance](#9-forensic-code-quality--zero-mock-compliance)

---

## 1. Architectural Overview

X-Mailer is built as an enterprise-grade, high-throughput email dispatcher optimized for resilient multi-key orchestration, custom SMTP transport, and RFC-compliant email deliverability.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION LAYER                          │
│                                                                         │
│   ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────┐ │
│   │   User Panel (React)  │   │  Admin Console (/vcon)│   │ /setup    │ │
│   │   - Compose & Content │   │  - Resend & SMTP Mgr  │   │ Wizard    │ │
│   │   - Task Dispatcher   │   │  - User Management    │   └───────────┘ │
│   │   - Live Analytics    │   │  - Branding & Storage │                 │
│   └───────────┬───────────┘   └───────────┬───────────┘                 │
│               │                           │                             │
│               └─────────────┬─────────────┘                             │
│                             │ (AppContext State & API Services)         │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │ HTTP / REST / WebSocket
┌─────────────────────────────┼───────────────────────────────────────────┐
│                             ▼                                           │
│                     API & DISPATCH LAYER                                │
│                                                                         │
│   ┌───────────────────────────────────┐   ┌───────────────────────────┐ │
│   │    Cloudflare Pages Functions     │   │   Express Server Node.js  │ │
│   │   (functions/api/[[catchall]])    │   │        (server.ts)        │ │
│   │    - Edge Request Interception    │   │   - Standard REST Router  │ │
│   │    - @neondatabase/serverless     │   │   - pg Connection Pool    │ │
│   └─────────────────┬─────────────────┘   └─────────────┬─────────────┘ │
│                     │                                   │               │
└─────────────────────┼───────────────────────────────────┼───────────────┘
                      │                                   │
┌─────────────────────┼───────────────────────────────────┼───────────────┐
│                     ▼                                   ▼               │
│                            PERSISTENCE & 3P SERVICES                    │
│                                                                         │
│   ┌────────────────────────┐  ┌───────────────────────┐  ┌────────────┐ │
│   │    Neon PostgreSQL     │  │  Resend REST / SMTP   │  │Supabase S3 │ │
│   │ (Relational Data & Log)│  │(Email Multi-Key Disp.)│  │ (Storage)  │ │
│   └────────────────────────┘  └───────────────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dual-Runtime Execution Model

X-Mailer provides complete isomorphic backend parity across two distinct deployment targets:

### 1. Cloudflare Pages Functions (`functions/api/[[catchall]].ts`)
- Runs on Cloudflare's global Anycast V8 edge runtime.
- Employs `@neondatabase/serverless` over WebSockets to query Neon PostgreSQL without connection limits.
- Supports zero-cold-start execution and direct IP resolution from incoming Cloudflare request headers (`cf-connecting-ip`, `cf-ray`).

### 2. Node.js Express Server (`server.ts`)
- Production-ready Docker / VPS entry point with Node.js connection pooling via `pg.Pool`.
- Full custom SMTP dispatcher (`nodemailer`) with TLS 1.2+ verification, custom RFC 5322 Message-ID creation, and connection pooling.

---

## 3. Component Hierarchy & State Management

```text
App.tsx (Root Layout & Global Providers)
 ├── AppContext (Global State: Auth, APIs, Channels, Tasks, Settings, Logs)
 └── UI Layer
      ├── SetupWizard (/setup)
      ├── User Portal (Dashboard, Tasks, Content, Presets, Logs, Analytics)
      └── Admin Console (/vcon) (API Keys, SMTP Channels, Storage, Security)
```

---

## 4. Bulk Dispatch & Rotation Pipeline

During bulk campaign execution, tasks proceed through a windowed pipeline:

1. **Pre-Flight DMARC Guard**: Validates that active sending domain aligns with authentication records.
2. **Dynamic Variable Interpolation**: Generates randomized, sender-aligned dynamic tags (`{INV}`, `{order_ref}`, `{R1-100}`) identically across subject and body.
3. **MIME Multipart Fallback**: Converts rich HTML to clean plain text via `htmlToPlainText`, preventing empty body spam flags.
4. **RFC 8058 Anti-Spam Headers**: Automatically injects One-Click List-Unsubscribe headers and verified Reply-To routes.
5. **Round-Robin Key Balancing**: Dynamically balances loads across active Resend API keys or SMTP pools.
6. **Adaptive 429 Rate Limiter**: Traps provider rate limits and pauses with exponential backoff (up to 3 retries).

---

## 5. RFC & Deliverability Hardening Engine

X-Mailer strictly follows Internet email standards:
- **RFC 8058**: One-Click Unsubscribe via HTTPS header injection.
- **RFC 5322 Section 3.6.4**: Domain-aligned unique Message-ID generation (`<timestamp.pid.rand@senderdomain>`).
- **RFC 2046**: Dual-Part `multipart/alternative` formatting.
- **MTA-STS & DANE**: Mandatory TLS 1.2+ certificate validation for custom SMTP.

---

## 6. Database Schema & Migration Layer

Persistence is powered by Neon PostgreSQL with 9 relational tables:
- `neon_users`: User authentication, credentials, and roles.
- `neon_apis`: Resend API keys, SMTP credentials, rate quotas, and verified domains.
- `neon_tasks`: Campaign tasks, execution status, recipient progress, and schedule metadata.
- `neon_content`: Reusable email templates, HTML bodies, and subject presets.
- `neon_presets`: Saved batch configurations.
- `neon_logs`: Granular system and delivery audit logs.
- `neon_settings`: Global platform branding, SMTP defaults, and company profiles.
- `neon_storage_config`: S3 credentials and endpoint configurations.
- `neon_storage_files`: Uploaded media files and asset references.

---

## 7. Security & Cryptography Framework

- **PBKDF2 SHA-512**: Passwords hashed with 100,000 iterations and 16-byte cryptographically secure salts.
- **JWT Authentication**: Stateles session tokens signed with SHA-256.
- **Brute-Force Rate Limiting**: Automatic IP-based lockout after consecutive authentication failures.
- **Credential Masking**: API keys and SMTP passwords masked in the UI.

---

## 8. Forensic Code Quality & Zero-Mock Compliance

In accordance with Vib Tools engineering standards:
- **Zero Mock / Fake Policy**: 100% real network calls, database queries, and dispatch operations.
- **Type Safety**: 100% TypeScript strict compliance with 0 linter errors.
