# 🚀 Deployment Guide — X-Mailer

**Project Name:** X-Mailer  
**Maintained By:** [Vib Tools](https://vib.tools/)  
**Primary Maintainer:** Md Nurnobi ([@victorsteele](https://github.com/victorsteele))  

This document provides exhaustive, step-by-step instructions for deploying **X-Mailer** in various production environments, with a primary focus on **Cloudflare Pages & Functions**, as well as alternative Docker, VPS, and Node.js hostings.

---

## 📑 Table of Contents

1. [Cloudflare Pages (Recommended Serverless Target)](#1-cloudflare-pages-recommended-serverless-target)
2. [Node.js / Express Server Deployment (Docker, VPS, Render, Railway)](#2-nodejs--express-server-deployment)
3. [Neon PostgreSQL Database Provisioning](#3-neon-postgresql-database-provisioning)
4. [Supabase S3 Storage Setup](#4-supabase-s3-storage-setup)
5. [Environment Variables Matrix](#5-environment-variables-matrix)
6. [Post-Deployment Verification & Troubleshooting](#6-post-deployment-verification--troubleshooting)

---

## 1. Cloudflare Pages (Recommended Serverless Target)

Cloudflare Pages provides zero-cold-start, globally distributed edge hosting with serverless API execution via **Pages Functions**.

### Architecture on Cloudflare Pages
- **Frontend SPA**: Static HTML, JS, CSS bundled into `dist/` and served directly from Cloudflare’s global Anycast CDN.
- **Backend API**: `functions/api/[[catchall]].ts` runs on Cloudflare V8 Workers runtime with `@neondatabase/serverless` connecting to Neon PostgreSQL over WebSocket/HTTPS.

### Prerequisites
1. A [Cloudflare](https://dash.cloudflare.com/) account.
2. A GitHub account with the `x-mailer` repository pushed.
3. A [Neon PostgreSQL](https://neon.tech/) database connection string.

---

### Step-by-Step Deployment Walkthrough

#### Step 1: Connect Git Repository
1. In Cloudflare Dashboard, navigate to **Workers & Pages** in the left navigation sidebar.
2. Click **Create application** > select **Pages** tab > click **Connect to Git**.
3. Choose your GitHub repository (`x-mailer`) and click **Begin setup**.

#### Step 2: Build & Output Settings
Configure the build presets as follows:

| Field | Setting |
| :--- | :--- |
| **Project name** | `x-mailer` (or custom subdomain) |
| **Production branch** | `main` (or `master`) |
| **Framework preset** | `None` (or `Vite`) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (leave blank) |

#### Step 3: Enable Node.js Compatibility Flag
Cloudflare Workers/Pages requires the `nodejs_compat` flag to enable Node.js built-in modules (`crypto`, `buffer`, `stream`).

1. Scroll down to the **Environment variables / Settings** or complete the first build.
2. Go to **Settings > Functions > Compatibility flags**.
3. Add or confirm `nodejs_compat` under **Production compatibility flags**.
4. Set **Compatibility date** to `2024-09-23` or later.

#### Step 4: Add Environment Variables & Secrets
Under **Settings > Environment variables**, add:
- `DATABASE_URL`: `postgresql://user:password@ep-...neon.tech/neondb?sslmode=require`
- `JWT_SECRET`: `your-secure-random-32-char-string`

#### Step 5: Run Setup Wizard
Once deployment finishes, open `https://<your-project>.pages.dev/setup` in your browser. The wizard will automatically create all 9 database tables and prompt you to create your initial administrator password.

---

## 2. Node.js / Express Server Deployment

For VPS (Ubuntu, Debian), Docker, Render, or Railway:

### Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "run", "start"]
```

### Run with PM2 on VPS
```bash
git clone https://github.com/vibtools/x-mailer.git /var/www/x-mailer
cd /var/www/x-mailer
npm install
npm run build
pm2 start npm --name "x-mailer" -- run start
```

---

## 3. Neon PostgreSQL Database Provisioning

1. Go to [Neon Console](https://console.neon.tech/) and create a project.
2. Select your preferred region (e.g. `US East`, `EU Frankfurt`, `Asia Singapore`).
3. Copy the pooled connection string (with `?sslmode=require`).
4. Paste it into your `DATABASE_URL` environment variable.

---

## 4. Supabase S3 Storage Setup (Optional for Logo/Assets)

1. Create a bucket named `x-mailer-assets` in Supabase Storage.
2. Go to **Settings > Storage** in Supabase and copy your S3 credentials (Access Key, Secret Key, Endpoint, Region).
3. Input these credentials into the **`/vcon/storage`** Admin Console to enable cloud storage for attachments and logos.

---

## 5. Environment Variables Matrix

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | Neon PostgreSQL connection URI | `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | **Yes** | Cryptographic secret for session tokens | `a7f9b8c2d1e3f4a5b6c7d8e9f0...` (32+ chars) |
| `PORT` | No | Server port (Node.js runtime) | `3000` |
| `NODE_ENV` | No | Application environment | `production` / `development` |

---

## 6. Post-Deployment Verification & Troubleshooting

- **Check API Status**: Navigate to `/api/health` or `/api/ip` to verify edge database connectivity.
- **WebSocket Timeout (Cloudflare)**: Ensure your Neon connection string uses the pooled domain format (`ep-...-pooler.region.neon.tech`).
- **SMTP Connection Test**: Use the **Test Connection** button inside `/vcon/apis` to verify your SMTP host, port, TLS handshake, and credentials.

---

## 🏢 Support & Community

- **Maintained By:** [Vib Tools](https://vib.tools/)
- **Technical Support:** [support@vib.tools](mailto:support@vib.tools)
- **General Inquiries:** [hello@vib.tools](mailto:hello@vib.tools)
- **Phone / WhatsApp:** [+880 1795-470603](https://wa.me/8801795470603)
