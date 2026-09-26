# 🤝 Contributing to X-Mailer

Thank you for your interest in contributing to **X-Mailer**! This project is maintained by **[Vib Tools](https://vib.tools/)** and the open-source community. We welcome contributions to make bulk email orchestration more reliable, secure, and deliverable.

---

## 📜 Core Engineering Principles

### 🚨 Strict Zero-Mock Policy (Mandatory)
- **No Mock, Fake, or Simulated Data**: All features, services, and integrations must connect to real endpoints (Neon PostgreSQL, Resend REST API, Custom SMTP, Supabase S3).
- **Never add hardcoded mock arrays**, fake delay timeouts masquerading as real network calls, or simulated state fallbacks.

### 🎯 Type Safety & Build Discipline
- **100% TypeScript Strict Mode**: No untyped `any` without explicit justification.
- **Zero Compilation Errors**: Always run `npm run lint` (`tsc --noEmit`) and `npm run build` before opening a pull request.
- **RFC Standards Alignment**: Any email header or transport modification must strictly comply with RFC 8058, RFC 5322, and RFC 2046 standards.

---

## 🛠️ Development Workflow

### 1. Fork & Clone
```bash
git clone https://github.com/vibtools/x-mailer.git
cd x-mailer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Local Environment
```bash
cp .env.example .env
# Configure your DATABASE_URL and JWT_SECRET
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Test Cloudflare Pages Locally
```bash
npm run build
npm run pages:dev
```

---

## 📋 Pull Request (PR) Checklist

Before submitting your PR, ensure you have completed the following:

- [ ] Code compiles cleanly with `npm run lint` (0 errors reported).
- [ ] Production build succeeds with `npm run build`.
- [ ] No fake or mock data has been added.
- [ ] Any new database fields or endpoints have corresponding schema updates in `server/db.ts` and `functions/api/[[catchall]].ts`.
- [ ] RFC deliverability standards and security checks pass.
- [ ] Documentation has been updated to reflect any new features or environment variables.

---

## 👨‍💻 Maintainers & Organization

- **Organization:** [Vib Tools](https://vib.tools/) (`@vibtools`)
- **Maintainer:** Md Nurnobi ([@victorsteele](https://github.com/victorsteele))
- **Inquiries:** [hello@vib.tools](mailto:hello@vib.tools) | [support@vib.tools](mailto:support@vib.tools)
