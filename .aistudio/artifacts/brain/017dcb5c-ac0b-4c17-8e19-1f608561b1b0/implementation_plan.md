# Implementation Plan: Zoho Mail OAuth / REST API Integration

> **Strict Scope-Lock Rule:** All existing features (Resend API Multi-Key rotation, Custom SMTP connection pool & TLS SNI, Task Queues, Live Logs, Admin Panel, Deliverability Scanner, Dynamic Tags) will remain **100% UNCHANGED & FUNCTIONAL**. Zoho Mail API will be introduced as an additional first-class provider in our pluggable Provider Strategy pattern.

---

## 1. Overview & Architecture Summary

Zoho Mail provides a high-throughput, secure REST API for email dispatch via OAuth 2.0 (`ZohoMail.messages.CREATE`). By adding a dedicated `server/providers/zoho.ts` adapter, we allow users to connect Zoho Mail accounts using OAuth credentials (Client ID, Client Secret, Refresh Token, and Account ID/Data Center Region) with zero port/firewall issues.

```
                    ┌────────────────────────┐
                    │   Unified Dispatcher   │
                    │   (sendEmailUnified)   │
                    └───────────┬────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Resend API   │       │  Custom SMTP  │       │ Zoho Mail API │  <-- NEW (Scope-Locked)
│ (resend.ts)   │       │   (smtp.ts)   │       │   (zoho.ts)   │
└───────────────┘       └───────────────┘       └───────────────┘
```

---

## 2. Technical Scope & Database Schema

### 2.1 Database Schema Additions (Non-Breaking)
In `neon_apis` table, the following nullable fields will be recognized for Zoho Mail:
- `provider_type`: `'resend' | 'smtp' | 'zoho'`
- `zoho_client_id`: string (Zoho API Client ID)
- `zoho_client_secret`: string (Zoho API Client Secret)
- `zoho_refresh_token`: string (Zoho OAuth Refresh Token)
- `zoho_account_id`: string (Zoho Mail Account ID or primary email)
- `zoho_region`: `'com' | 'eu' | 'in' | 'com.au' | 'jp' | 'com.cn' | 'ca'` (Accounts Data Center)

---

## 3. Implementation Steps (Step-by-Step)

### Step 1: Types & Unified Provider Contract
- **Files:** `server/providers/types.ts`, `src/types/index.ts`
- Extend `ProviderType` to include `'zoho'`.
- Add optional Zoho configuration parameters to `EmailChannel` and `ResendApiKey` interfaces.

### Step 2: Dedicated Zoho Mail Provider Adapter
- **New File:** `server/providers/zoho.ts`
- **OAuth Token Management:**
  - Token refresh function (`getZohoAccessToken`) that exchanges `refresh_token` for an active `access_token` from `https://accounts.zoho.{region}/oauth/v2/token`.
  - In-memory token cache with expiration timestamp (50-minute TTL) to minimize OAuth calls during bulk campaigns.
- **Verification Endpoint (`verifyZoho`):**
  - Calls Zoho Mail User Accounts API (`https://mail.zoho.{region}/api/accounts`) to validate credentials, retrieve account ID, and verify the sender address.
- **Dispatch Adapter (`sendWithZoho`):**
  - Calls `POST https://mail.zoho.{region}/api/accounts/{accountId}/messages` with payload formatted for Zoho JSON schema (fromAddress, toAddress, subject, content, attachments, custom headers).

### Step 3: Integrate with Unified Dispatcher & Edge Worker
- **Files:** `server/providers/index.ts`, `server.ts`, `functions/api/[[catchall]].ts`
- Update `sendEmailUnified` and `verifyChannel` to route `provider === 'zoho'` to `sendWithZoho` and `verifyZoho`.
- Add `/api/zoho/verify` route in both Express (`server.ts`) and Cloudflare Pages Functions (`functions/api/[[catchall]].ts`).
- Update database CRUD queries to store and retrieve Zoho-specific fields seamlessly.

### Step 4: API Service Client & UI Updates
- **Files:** `src/services/apiService.ts`, `src/components/pages/ApisPage.tsx`
- Add `verifyZohoChannelApi` helper in `apiService.ts`.
- In `ApisPage.tsx`:
  - Add **"Zoho Mail API"** to the Provider dropdown (`resend` | `smtp` | `zoho`).
  - Render compact credentials form for Zoho (Client ID, Client Secret, Refresh Token, Region Selector `[.com, .eu, .in, .com.au, .ca]`, Account ID/Email).
  - Add quick helper guide link to Zoho API Console (`https://api-console.zoho.com`).
  - In the Channel Table, render a sleek **ZOHO** badge (emerald/teal theme).
  - Test & Re-verify buttons support live diagnostics for Zoho Mail API with full protocol logs.

---

## 4. Verification & Testing Plan

1. **Direct Verification:** Test credential validation with real Zoho tokens (checking `access_token` generation and account details retrieval).
2. **Live Test Send:** Send a diagnostic test email via Zoho Mail API to verify headers, HTML body, and RFC plain-text alternative.
3. **Queue & Rotation Integration:** Verify that Tasks and Campaigns can mix Resend, SMTP, and Zoho Mail channels in the same round-robin queue without collision.
4. **Cloudflare & Express Parity:** Verify build on Cloudflare Pages (`npm run build` & `functions/api/[[catchall]].ts`) and Node.js dev server.
5. **Quality Gates:** `npm run lint` (`tsc --noEmit`) passes with 0 warnings/errors.
