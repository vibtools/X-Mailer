# AGENTS.md — Agent Working Rules & Guidelines

This document outlines the mandatory operational rules, constraints, and protocols for any AI Agent working on this codebase.

---

## 🚨 Rule 01: Zero Fake / Demo / Mock Policy (কঠোর বাস্তবায়ন নীতি)

### 1.1 Strict Prohibition of Mock / Fake / Demo Features
- **কোনো প্রকার Fake, Demo, Mock বা Simulated ডাটা/ফিচার প্রজেক্টে যুক্ত করা যাবে না এবং পূর্বে থেকে থাকলেও রাখা যাবে না।**
- All features, integrations, and logic must be **100% real, functional, and production-ready** (e.g., real API endpoints, real PostgreSQL/Neon database queries, real Resend dispatch, real S3 storage).
- Never write hardcoded fallback mock arrays (e.g., `const mockData = [...]`), fake timeouts masquerading as real network calls (`setTimeout`), or dummy placeholder state.

### 1.2 Detection & Remediation Protocol
- **কখনো কোডে কোনো Fake / Mock / Demo ফিচার বা ডাটা চোখে পড়লে:**
  1. অবিলম্বে ইউজারকে বিষয়টি স্পষ্টভাবে জানাতে হবে (Report to User)।
  2. নিজের ইচ্ছামতো অনুমানের উপর ভিত্তি করে রিমুভ বা পরিবর্তন করা যাবে না।
  3. **ইউজার যেভাবে ঠিক (Fix) করতে নির্দেশ দেবেন, হুবহু সেই নির্দেশিকা ও আর্কিটেকচার অনুযায়ী ফিক্স করতে হবে।**

---

## 📜 Rule 02: Strict Adherence to `AI_INSTRUCTIONS.md` (বাধ্যতামূলক নির্দেশিকা)

### 2.1 Always Follow `AI_INSTRUCTIONS.md`
- **প্রজেক্টের যেকোনো ফাইল Update, Fix, Add বা Refactor করার সময় `AI_INSTRUCTIONS.md` ফাইলের সকল রুলস ও নির্দেশাবলী অক্ষরে অক্ষরে মেনে চলতে হবে।**
- Whenever performing any task:
  - **Scope Discipline:** Stay strictly within the user's requested scope (Do not expand small tasks into unrelated refactors).
  - **Code Quality & Stability:** Ensure no breaking changes, syntax errors, or type errors are introduced.
  - **Verification:** Always run typecheck, linting, and build validation before completing the task.
  - **Architecture Integrity:** Respect the established conventions (React + Tailwind + Express / Cloudflare Pages Functions + Neon PostgreSQL).

---

## 🧠 Rule 03: Live Memory Synchronization (লাইভ মেমরি আপডেট নীতি)

### 3.1 Continuous Live Memory Maintenance (`MEMORY.md`)
- **প্রজেক্টের যেকোনো Update, Feature Add, Bug Fix, বা Architectural Change করার সাথে সাথে অবশ্যই `MEMORY.md` ফাইলটিতে Live Update করতে হবে।**
- Every agent must record:
  1. New files, endpoints, or components created/modified.
  2. Database schema additions or migrations.
  3. Environment variables or deployment configurations.
  4. Project state, operational status, and any verified behaviors.
- Never complete a task without ensuring `MEMORY.md` reflects the true current state of the repository.

---

## 🛠️ Summary of Core Agent Behavior

1. **Understand & Comply:** Read user intent, adhere strictly to `AI_INSTRUCTIONS.md`, `MEMORY.md`, and this `AGENTS.md`.
2. **Real Implementations Only:** Zero tolerance for fake/mock/demo implementations.
3. **Transparent Reporting:** Report any found mock/demo remnants directly to the user and await explicit fix instructions.
4. **Live Memory Update:** Always synchronize `MEMORY.md` immediately with all changes.
5. **Final Verification:** Ensure `npm run lint`, `npm run build`, and server integrity are tested and verified.
