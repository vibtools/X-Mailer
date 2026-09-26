# Copilot Instructions for R Sender

## Project purpose

This repository is the R Sender bulk email automation platform. It connects a React + TypeScript frontend to an Express backend and PostgreSQL data layer, using real Resend API credentials and Neon Postgres persistence.

## Working rules

- Treat this project as a real production application, not a demo or mock project.
- Preserve the existing architecture: React frontend, Express backend, PostgreSQL data persistence, and real external API integrations.
- Do not introduce fake/mock/simulated behavior, placeholder users, or synthetic data unless explicitly required by a real integration test.
- Keep changes targeted to the request and avoid broad refactors or unrelated cleanup.
- Follow the existing conventions in `AI_INSTRUCTIONS.md` and `AGENTS.md`.

## Required memory discipline

This project requires persistent memory tracking. Any meaningful change must be reflected in [MEMORY.md](../MEMORY.md) or a direct markdown update proposal.

CRITICAL RULE: Whenever a change, update, bug fix, or new feature is implemented in this project during our conversation, you (the AI) must automatically prompt me to update the `MEMORY.md` file, or directly write/suggest the exact markdown updates needed to keep the project memory 100% up-to-date in real-time.

## When making changes

- Summarize what changed in the context of the project architecture.
- Record database/schema changes, new or modified API routes, new frontend modules, and deployment assumptions.
- If the change affects business logic or workflow, update the memory file so future sessions do not require a fresh audit.
- Prefer keeping the project knowledge base accurate over broad explanation.

## Verification expectations

- Validate the relevant TypeScript/build workflow before claiming completion.
- If the task affects runtime behavior, check the most relevant command or verification path and report actual evidence.
- Keep final summaries focused on the work completed and the current system state.
