# Oryxa Developer Agent Guidelines

Welcome! This document outlines the project structure, development workflows, rules, and best practices for developer agents (like Antigravity) working on the Oryxa repository.

---

## 1. Project Overview & Tech Stack
Oryxa is a multi-tenant, multi-channel AI auto-reply e-commerce SaaS. Merchants connect social channels (Facebook Messenger, etc.) from a web dashboard, enabling a LangGraph + Gemini-powered agent to answer product queries, manage carts, and create orders directly from chat.

- **Package Manager & Runtime**: Bun (v1.2+ Workspaces)
- **Backend API**: Hono + `@hono/zod-openapi` + Swagger UI
- **Frontend Dashboard**: Next.js 15 (App Router) + Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM (PGlite in-memory for tests)
- **AI Sales Agent**: LangChain + LangGraph ReAct agent + Gemini 2.5 Flash-Lite
- **Authentication**: Firebase Auth (Admin SDK on backend, Client SDK on web)
- **Storage**: UploadThing / Backblaze B2

---

## 2. Directory Layout & Package Registry

- [apps/api](file:///home/radix/Dev/Oryxa/apps/api) — Core Hono API and Facebook webhook receiver.
- [apps/web](file:///home/radix/Dev/Oryxa/apps/web) — Next.js 15 merchant portal.
- [packages/db](file:///home/radix/Dev/Oryxa/packages/db) — Drizzle PostgreSQL schemas and CRUD methods.
- [packages/shared](file:///home/radix/Dev/Oryxa/packages/shared) — Zod validation schemas (shared source of truth).
- [packages/agent](file:///home/radix/Dev/Oryxa/packages/agent) — Core LangGraph Agent logic, systems prompts, and customer-facing tools.
- [packages/integrations](file:///home/radix/Dev/Oryxa/packages/integrations) — Social platform integrations (Meta Send API) and file storage (Backblaze B2).
- [packages/utils](file:///home/radix/Dev/Oryxa/packages/utils) — Shared helper utilities.
- [tests](file:///home/radix/Dev/Oryxa/tests) — Vitest test suites (run using in-memory PGlite).

---

## 3. Core Architectural Rules

### A. Single Source of Truth for Schemas
- Zod schemas in `packages/shared/schemas` are the single source of truth for validation.
- All request/response schemas for Hono routes must import and extend these Zod schemas.
- Do not redefine data structures or models in separate packages.

### B. End-to-End Type Safety
- Hono serves OpenAPI specs at `/doc` and Swagger UI at `/ui`.
- When API route inputs or outputs are modified, regenerate the React Query frontend client hooks:
  ```bash
  bun --filter web gen:api
  ```
- This runs `openapi-zod-client` to keep [apps/web/lib/api.ts](file:///home/radix/Dev/Oryxa/apps/web/lib/api.ts) synchronized.

### C. Webhooks & Fire-and-Forget Agent Runner
- Social webhook endpoints (e.g. `/webhooks/facebook`) **MUST** return a `200 OK` status immediately to prevent Meta webhook timeouts.
- The webhook handler triggers the agent run asynchronously using a non-blocking `fetch` to `${process.env.AGENT_RUNNER_URL}/run`.
- The conversation state machine manages states: `pending` -> `working` -> `done`.
- If new user messages arrive while state is `working`, they remain `pending`. When the agent run finishes, the runner recursively checks for pending messages and triggers a new run if needed.

### D. Path Aliases
Always import codebase packages using their registered typescript path aliases:
- Database & CRUD: `@db/*` (maps to `packages/db/*`)
- Shared/Zod Schemas: `@shared/*` (maps to `packages/shared/*`)
- AI Agent Package: `@agent/*` (maps to `packages/agent/*`)
- API Backend Source: `@api/*` (maps to `apps/api/src/*`)

---

## 4. Database Rules
- **No Raw SQL**: Use Drizzle ORM client (`db` from `@repo/db/client`) and schemas (`@repo/db/schema`).
- **CRUD Abstraction**: Always write or extend functions under `packages/db/crud/` (e.g., `createProduct`, `getConversationWithHistory`) instead of writing inline database queries in api route handlers or agent tools.
- **Applying Schema Changes**: Run `bun run db:push` to push local schema changes to your database. Use `bun run db:studio` for visual verification.

---

## 5. Development & Testing

### Running Servers Locally
1. Ensure the root `.env` is filled (refer to [architecture.md](file:///home/radix/Dev/Oryxa/architecture.md) for environment details).
2. Start the API server on port 3001:
   ```bash
   bun run dev:api
   ```
3. Start the Web dashboard on port 3400:
   ```bash
   bun run dev:web
   ```

### Testing Suite
- Run test suite (utilizes in-memory PGlite database):
  ```bash
  bun test
  ```
- To test with live Neon Database:
  ```bash
  bun run test:neon
  ```
- Do not use live external API keys in tests. Mock social platform send APIs and inject a mock deterministic LLM (`tests/helpers/fake-llm.ts`).

---

## 6. How to Extend the AI Sales Agent
If you need to add or update tools for the customer-facing AI sales agent:
1. Define a tool function in [packages/agent/tools/index.ts](file:///home/radix/Dev/Oryxa/packages/agent/tools/index.ts) (or in a separate file and export it) using `@langchain/core/tools`'s `tool()` helper.
2. Register the tool in `createAgentTools` inside [packages/agent/tools/index.ts](file:///home/radix/Dev/Oryxa/packages/agent/tools/index.ts).
3. Update agent system prompts so the model understands the new tool's capabilities.
4. Add corresponding tests under `tests/agent/tools.test.ts`.
