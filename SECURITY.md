# 🔒 Security Policy — X-Mailer

**Maintained By:** [Vib Tools](https://vib.tools/)  
**Primary Maintainer:** Md Nurnobi ([@victorsteele](https://github.com/victorsteele))  

The security of **X-Mailer** and the integrity of customer email credentials and data are paramount. This document outlines our security architecture, supported versions, and vulnerability disclosure process.

---

## 🛡️ Supported Versions

Only the latest release receives active security patches and updates:

| Version | Supported |
| :--- | :---: |
| `1.0.x` | ✅ Yes |
| `< 1.0` | ❌ No |

---

## 🔐 Core Security Standards

### 1. Cryptography & Password Hashing
- Master administrator and standard user passwords are never stored in plaintext.
- Hashes are generated using **PBKDF2 SHA-512** with 100,000 iterations and a cryptographically secure 16-byte random salt generated via `crypto.randomBytes(16)`.
- Authentication tokens are signed and verified against the production `JWT_SECRET`.

### 2. Transport Security & Strict TLS
- All custom SMTP transports default to strict certificate verification (`rejectUnauthorized: true`) with minimum protocol requirement set to `TLSv1.2`.
- Prevents Man-in-the-Middle (MITM) downgrade attacks during email dispatch.

### 3. Brute-Force & Rate Limiting Protection
- Authentication endpoints (`/api/auth/login`, `/api/auth/admin-login`) enforce exponential lockout delays on repeated failed attempts from the same IP address.

### 4. SQL Injection Defense
- All database queries across both Express and Cloudflare Functions backends use parameterized queries (`$1, $2, ...`) without string concatenation or unescaped variables.

### 5. API Key & Credential Obfuscation
- Stored Resend API keys and SMTP credentials are masked in the UI (`re_***...***`) to prevent shoulder surfing or unintended credential exposure.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability in **X-Mailer**, please follow these responsible disclosure steps:

1. **Do not create a public GitHub issue.**
2. Send an email directly to the Vib Tools security team at **[support@vib.tools](mailto:support@vib.tools)** with:
   - Description of the vulnerability.
   - Exact steps to reproduce.
   - Proof of concept (PoC) code or network request log.
3. You will receive an initial response within **24–48 hours** acknowledging receipt.
4. Once the vulnerability is verified and patched, a security release and CVE advisory (if applicable) will be published.

---

## 🏢 Contact Information

**Vib Tools HQ**  
5660 Kochakata, Nageswari, Kurigram, Rangpur, Bangladesh  
- **Support Email:** [support@vib.tools](mailto:support@vib.tools)  
- **General Inquiries:** [hello@vib.tools](mailto:hello@vib.tools)  
- **Phone / WhatsApp:** [+880 1795-470603](https://wa.me/8801795470603)
