# Multi-Provider Email Architecture & Custom SMTP Integration Plan

A modular, future-proof architectural blueprint to transition R Sender from a single-vendor (Resend API) service into an extensible, multi-provider email automation platform supporting custom SMTP servers (Gmail, Outlook, Amazon SES, Mailgun, cPanel/Postfix) alongside Resend with unified round-robin task orchestration.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Design Pattern Selected:** Strategy/Adapter Pattern via a dedicated `server/providers/` subsystem.
> Instead of embedding SMTP and transport logic inside the 2,200+ line `server.ts`, all provider operations will be abstracted into dedicated provider adapters. This guarantees zero breaking changes to existing Resend workflows and allows adding future providers (SendGrid, Mailgun, SES API) in minutes without touching core app logic.

- **Confirmed Decision 1**: Adopt a standalone Provider Adapter architecture (`server/providers/`) with unified sending contracts.
- **Confirmed Decision 2**: Support both single-key and multi-provider round-robin rotation in a single task (e.g. 2 Resend Keys + 3 SMTP servers in one batch).
- **Security & Storage Decision**: Store SMTP passwords/app-keys secured in PostgreSQL `neon_apis` with SSL/TLS verification before saving.

---

## 1. Overview & Core Concept

- **What It Does**: Enables users to configure and manage unlimited custom SMTP channels alongside Resend API keys. Provides instant SMTP handshake verification, TLS/SSL configuration (ports 465, 587, 25), pooled persistent connections, and seamless multi-channel round-robin bulk delivery.
- **Target Audience / Persona**: Email marketers, automation specialists, and enterprise operators running hybrid delivery across transactional APIs (Resend) and corporate/custom SMTP relays.
- **Key Value**: Eliminates vendor lock-in. Slashes email costs by leveraging existing SMTP infrastructure, increases delivery throughput via parallel channel pools, and prevents account suspension through multi-provider failover.

---

## 2. User Experience & Visual Design

The UI will conform strictly to R Sender's established high-density, zero-shadow, dark slate palette (`bg-slate-950`, `border-slate-800`, `Plus Jakarta Sans`, lightweight typography).

```
┌────────────────────────────────────────────────────────────────────────┐
│ Sender Channels (Resend & SMTP)               [+ Connect New Channel]  │
├────────────────────────────────────────────────────────────────────────┤
│ [Total Channels: 8]  ·  [Active & Verified: 7]  ·  [Daily Capacity: 45k]│
├────────────────────────────────────────────────────────────────────────┤
│ Channel Name     │ Type     │ Host / Endpoint     │ Status   │ Actions │
│ ─────────────────┼──────────┼─────────────────────┼──────────┼─────────┤
│ Production SES   │ SMTP     │ email-smtp.us-east-1│ Active   │ Test ✎ 🗑│
│ Google Workspace │ SMTP     │ smtp.gmail.com:587  │ Active   │ Test ✎ 🗑│
│ Resend Marketing │ Resend   │ api.resend.com      │ Active   │ Test ✎ 🗑│
└────────────────────────────────────────────────────────────────────────┘
```

### Key User Flows

1. **Channel Creation & Modal Selection**:
   - User clicks `+ Connect New Channel` on the Channels page (`ApisPage.tsx`).
   - Modal presents a clean segment toggle: **`[ Resend API ]`** or **`[ Custom SMTP ]`**.
   - When **SMTP** is selected, the form seamlessly transitions to SMTP fields:
     - *Channel Label* (e.g., "Google Workspace Relay")
     - *SMTP Host* (e.g., `smtp.gmail.com`) & *Port* (`587`, `465`, `25`)
     - *Security Mode* (TLS/STARTTLS vs SSL)
     - *Username / Email* & *Password / App Password*
     - *From Name* & *Sender Email Address*
     - *Daily Sending Quota*
2. **Pre-Save Interactive Connectivity Verification**:
   - An inline `[⚡ Test Handshake]` button connects to the SMTP server via `nodemailer.verify()`, checks TLS certificate, credentials, and authentication, rendering immediate success or granular error diagnostics without closing the modal.
3. **Unified Task Orchestration**:
   - In `TasksPage.tsx`, the channel selection drawer displays all available senders grouped or labeled with crisp badges (`RESEND` or `SMTP`).
   - The task runner executes round-robin across selected channels transparently, whether Resend, SMTP, or a mix of both.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Standalone `server/providers/` Subsystem vs. Monolithic `server.ts`**
  - *Chosen Approach*: Create `server/providers/types.ts`, `server/providers/resend.ts`, `server/providers/smtp.ts`, and `server/providers/index.ts`.
  - *Why*: Keeps `server.ts` lean, eliminates regression risks, and enables connection pooling and unified telemetry across all dispatch methods.
  - *Alternatives Considered*: Inlining SMTP logic into `server.ts` was rejected due to file bloat (already 2,275 lines) and high risk of regression bugs.

- **Decision 2: Database Schema Evolution (`neon_apis`)**
  - *Chosen Approach*: Extend the existing `neon_apis` table with nullable SMTP columns (`provider_type`, `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`) via backward-compatible `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - *Why*: Avoids creating fragmented tables, preserves existing task relationships (`api_ids` array in `neon_tasks`), and requires zero data migrations for existing Resend users.

- **Decision 3: SMTP Connection Pooling in Worker/Server**
  - *Chosen Approach*: Maintain an in-memory transport cache (`Map<string, Transporter>`) keyed by channel ID with idle connection pooling (`pool: true`, `maxConnections: 5`).
  - *Why*: Opening a new TCP/TLS socket for every single recipient in a bulk campaign causes massive latency (300-800ms per handshake) and triggers SMTP rate-limiting. Connection pooling delivers sub-50ms dispatch times per email.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 SPA)                         │
│   ApisPage.tsx        TasksPage.tsx       ContentPage.tsx              │
│   (Channel Modal)    (Round-Robin Pool)  (Deliverability Test)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON
┌───────────────────────────────────▼────────────────────────────────────┐
│                         BACKEND (Express 4 API)                        │
│   /api/channels (CRUD)   /api/send (Unified)   /api/smtp/verify        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                   GLOBAL DISPATCHER (Adapter Pattern)                  │
│                      server/providers/index.ts                         │
│                                   │                                    │
│         ┌─────────────────────────┴─────────────────────────┐          │
│         ▼                                                   ▼          │
│  [Resend Adapter]                                    [SMTP Adapter]    │
│  - REST API fetch()                                  - Nodemailer Pool │
│  - Round-robin key rotation                          - TLS/SSL Sockets │
│  - Domain check endpoint                             - RFC-2046 MIME   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    DATA LAYER (Neon PostgreSQL)                        │
│   neon_apis (extended)    neon_tasks (api_ids)    neon_logs (audit)    │
└────────────────────────────────────────────────────────────────────────┘
```

### File-by-File Implementation Matrix

| Layer | Files | Key Changes |
| :--- | :--- | :--- |
| **Dependencies** | `package.json` | Install `nodemailer` and `@types/nodemailer` (dev). |
| **Providers Core** | `server/providers/types.ts`<br>`server/providers/resend.ts`<br>`server/providers/smtp.ts`<br>`server/providers/index.ts` | Define `EmailChannel`, `EmailPayload`, `SendResult` interfaces; build isolated Resend and SMTP adapters; implement connection pooling and unified dispatch engine. |
| **Database** | `server/db.ts` | Add idempotent DDL columns: `provider_type`, `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`. |
| **API Server** | `server.ts` | Mount `/api/smtp/verify` for real-time connection checks; route `/api/send` through `emailDispatcher`; update `/api/apis` CRUD to handle SMTP fields. |
| **Frontend Types** | `src/types/index.ts` | Extend `ResendApiKey` (or aliased `SenderChannel`) with optional SMTP fields and `provider_type`. |
| **Services & State** | `src/services/apiService.ts`<br>`src/context/AppContext.tsx` | Add `verifySmtpChannelApi`; update `sendNextEmailInTask` to pass channel payload to unified dispatcher. |
| **UI Components** | `src/components/pages/ApisPage.tsx`<br>`src/components/pages/TasksPage.tsx` | Add SMTP/Resend switcher in modal; add SMTP test button; render channel type indicators; update task creation sender drawer. |

---

## 5. Phased Execution Roadmap

- [ ] **Phase 1: Package & Database Schema**
  - Install `nodemailer` and `@types/nodemailer`.
  - Add idempotent column migrations in `server/db.ts`.
- [ ] **Phase 2: Core Provider Engine (`server/providers/`)**
  - Implement `types.ts`, `smtp.ts` (with connection pooling), `resend.ts`, and unified `index.ts`.
  - Wire `/api/smtp/verify` and unified `/api/send` in `server.ts`.
- [ ] **Phase 3: Frontend Types & Service Layer**
  - Update `src/types/index.ts` and `apiService.ts` for dual-provider contracts.
- [ ] **Phase 4: UI Enhancements (`ApisPage.tsx` & `TasksPage.tsx`)**
  - Upgrade Connect Modal with Resend/SMTP tabs, port selector, and instant handshake tester.
  - Upgrade channel table with type badges (`RESEND` / `SMTP`) and clean action triggers.
- [ ] **Phase 5: Verification & Quality Assurance**
  - Run `lint_applet` (`tsc --noEmit`) and `compile_applet` (`vite build`).
  - Verify live SMTP handshake test and task dispatch telemetry.
