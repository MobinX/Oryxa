# Oryxa — Architecture

Multi-channel AI auto-reply SaaS for e-commerce. Merchants manage products, orders, and Messenger channels from a web dashboard; inbound Facebook messages trigger a Gemini-powered sales agent.

---

## Monorepo layout

```
oryxa/
├── .env                    # Canonical secrets (gitignored) — see “Environment”
├── .env.example            # Template — copy to .env and fill in
├── apps/
│   ├── api/                # @repo/api — Hono API (standalone Bun or Vercel)
│   ├── api2/               # Next.js host for the same Hono app (optional)
│   └── web/                # Next.js merchant dashboard
├── packages/
│   ├── db/                 # @repo/db — Drizzle schema + CRUD
│   ├── shared/             # @repo/shared — Zod/OpenAPI schemas
│   ├── agent/              # @repo/agent — LangGraph + Gemini agent
│   ├── integrations/       # @repo/integrations — Facebook, B2
│   └── utils/              # @repo/utils — shared helpers
├── tests/                  # Vitest (PGlite + optional Neon)
├── drizzle.config.ts
├── vitest.config.ts
└── package.json            # Root scripts (dev:api, dev:web, db:push, …)
```

**Runtime:** [Bun](https://bun.sh) workspaces. **Database:** Postgres (Neon recommended). **Auth:** Firebase (Google sign-in on web, Admin SDK on API).

---

## Applications

### `@repo/api` (`apps/api`)

The core backend. One Hono `app` (`src/app.ts`) is shared everywhere.

| Entry | Purpose |
|-------|---------|
| `src/bunServe.ts` | Local dev — `bun run dev:api` (hot reload, port `API_PORT`) |
| `src/index.ts` | Vercel — `export default handle(app)` |
| `api/index.ts` | Re-exports Vercel handler |
| `exports["./app"]` | Imported by `api2` as `@repo/api/app` |

**Routes**

| Path | Description |
|------|-------------|
| `GET /` | Health |
| `/api/v1/users/*` | User sync + profile |
| `/api/v1/businesses/*` | Business CRUD |
| `/api/v1/{businessId}/products\|orders\|channels\|conversations\|uploads` | Tenant-scoped resources |
| `/api/v1/auth/facebook/callback` | Meta OAuth callback |
| `/webhooks/facebook` | Messenger webhook |
| `/internal/run` | Agent runner (internal key) |
| `/doc`, `/ui` | OpenAPI + Swagger UI |

**Middleware:** Firebase JWT (`authMiddleware`), business ownership (`businessAccessMiddleware`).

### `api2` (`apps/api2`)

Optional Next.js wrapper around the same Hono app via `hono/vercel` `handle()`. Useful for a single Next deployment or local experimentation on port `API2_PORT` (default `3500`).

Route handlers re-export `GET`/`POST`/… from `lib/hono-handlers.ts`, which imports `app` from `@repo/api/app`.

### `web` (`apps/web`)

Next.js 15 dashboard. Flow:

1. `/` → `/login` (Firebase Google)
2. `/businesses` — list / create businesses
3. `/b/{businessId}/…` — dashboard, products, orders, channels, inbox

Uses `NEXT_PUBLIC_API_URL` for all API calls. React Query for data fetching.

---

## Packages

| Package | Role |
|---------|------|
| `@repo/db` | Drizzle schema, migrations, CRUD (`business`, `product`, `order`, `channel`, `conversation`, …) |
| `@repo/shared` | Zod schemas used by API OpenAPI routes and validation |
| `@repo/agent` | `Agent` class — LangGraph ReAct agent + tools (see [agent.md](./agent.md)) |
| `@repo/integrations` | Facebook Send API, OAuth helpers, Backblaze B2 uploads |
| `@repo/utils` | Small shared utilities |

**Path aliases** (per-package `tsconfig.json`):

| Alias | Package |
|-------|---------|
| `@api/*` | `apps/api/src/*` |
| `@db/*` | `packages/db/*` |
| `@shared/*` | `packages/shared/*` |
| `@agent/*` | `packages/agent/*` |

Workspace imports use scoped names: `@repo/db`, `@repo/api`, etc.

---

## Data model (simplified)

```
users
  └── businesses
        ├── categories → products → variants
        ├── orders
        ├── agents
        ├── channels (Facebook page + token + agentId)
        └── conversations → messages
```

Each business belongs to one user. Channels link a Meta Page to an agent. Conversations are per customer per channel.

---

## Request flows

### Authenticated dashboard

```
Browser (web)
  → Firebase ID token in Authorization header
  → API /api/v1/...
  → authMiddleware verifies JWT → loads user
  → businessAccessMiddleware (tenant routes)
  → @repo/db CRUD
```

### Inbound Messenger message

```
Meta webhook POST /webhooks/facebook
  → resolve channel by page ID
  → processInboundMessage (DB)
  → triggerAgentRun(conversationId)  [fire-and-forget HTTP]
       → POST {AGENT_RUNNER_URL}/internal/run
       → runAgentForConversation
       → @repo/agent Agent.run()
       → tools: get_product, create_order, send_message
```

`AGENT_RUNNER_URL` usually points at the same API host (self-call). On Vercel, `waitUntil` keeps the agent run alive after the webhook responds.

Details: [agent.md](./agent.md).

---

## Environment files (three locations)

Oryxa uses **one canonical `.env` at the repo root** plus **app-specific files** so each runtime loads variables correctly.

| # | File | Purpose |
|---|------|---------|
| 1 | **`.env`** (repo root) | Single source of truth — database, Firebase Admin, Gemini, Meta, B2, internal keys, ports |
| 2 | **`apps/web/.env.local`** | Next.js **client** vars only (`NEXT_PUBLIC_*` + API URL the browser should call) |
| 3 | **`apps/api2/.env.local`** | Symlink → `../../.env` so Next.js server routes see full API secrets |

`apps/api` does **not** need its own file for normal dev — scripts use `bun --env-file=../../.env`. For `vercel dev` in `apps/api`, symlink `apps/api/.env.local` → `../../.env`.

All `*.env*` paths are gitignored.

### Variable ownership

| Variable group | Root `.env` | `apps/web/.env.local` |
|----------------|-------------|------------------------|
| `DATABASE_URL` | ✓ | — |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | ✓ | — |
| `NEXT_PUBLIC_FIREBASE_*` | ✓ (optional duplicate) | ✓ **required** for Next build |
| `GEMINI_API_KEY`, `META_*`, `B2_*`, `INTERNAL_KEY` | ✓ | — |
| `NEXT_PUBLIC_API_URL` | ✓ | ✓ **must match** reachable API URL |
| `WEB_URL`, `AGENT_RUNNER_URL`, `META_REDIRECT_URI` | ✓ | — |
| `API_PORT`, `API2_PORT`, `WEB_PORT` | ✓ | — |

**Codespaces / tunnels:** set `NEXT_PUBLIC_API_URL` and `WEB_URL` to your forwarded URLs (e.g. `https://….app.github.dev` with the correct port suffix).

**Using api2 instead of standalone API:** point `NEXT_PUBLIC_API_URL` and `AGENT_RUNNER_URL` at `http://localhost:3500` (or your api2 deploy URL).

---

## Project initialization

### 1. Prerequisites

- Bun 1.2+
- Postgres ([Neon](https://neon.tech))
- Firebase project (Google sign-in + service account)
- Meta Developer app (Messenger)
- [Google AI Studio](https://aistudio.google.com/apikey) API key
- Backblaze B2 bucket + application key

### 2. Clone and install

```bash
git clone <repo-url> oryxa && cd oryxa
bun install
```

### 3. Create environment files

```bash
# 1) Root — copy template and fill every value
cp .env.example .env

# 2) Web — client-facing vars (subset of root)
cat > apps/web/.env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
EOF
# Paste Firebase web config from Firebase Console → Project settings → Your apps

# 3) api2 — symlink to root (Next.js reads .env.local at app root)
ln -sf ../../.env apps/api2/.env.local

# Optional: Vercel CLI for apps/api
ln -sf ../../.env apps/api/.env.local
```

Edit `.env` with real secrets. Keep `apps/web/.env.local` in sync for `NEXT_PUBLIC_*` and the API URL your browser can reach.

### 4. Database

```bash
bun run db:push      # apply schema to DATABASE_URL
bun run db:studio    # optional Drizzle Studio
```

### 5. Run locally

**Standard setup (standalone API + web):**

```bash
# Terminal 1 — API on http://localhost:3001
bun run dev:api

# Terminal 2 — Web on http://localhost:3400
bun run dev:web
```

Open http://localhost:3400 → login → businesses → open a workspace.

**Alternative — API via Next.js (api2):**

```bash
bun run dev:api2     # http://localhost:3500
# Set NEXT_PUBLIC_API_URL=http://localhost:3500 in apps/web/.env.local
bun run dev:web
```

### 6. Verify

```bash
curl http://localhost:3001/          # {"name":"Oryxa API",...}
curl http://localhost:3001/doc       # OpenAPI JSON
bun test                             # unit tests (PGlite)
```

### 7. External hooks (after deploy)

| Service | Setting |
|---------|---------|
| Meta webhook | `https://<api-host>/webhooks/facebook` + `META_VERIFY_TOKEN` |
| Meta OAuth redirect | `META_REDIRECT_URI` → `https://<api-host>/api/v1/auth/facebook/callback` |
| API CORS | `WEB_URL` → your web app origin |

---

## Build and deploy

| Command | Output |
|---------|--------|
| `bun run build:api` | `apps/api/public/index.js` (Vercel) + `public/server/index.js` (Bun) |
| `bun run build:web` | Next.js production build |
| `bun run build:api2` | Next.js + embedded Hono |

**Vercel (recommended):** two projects from one repo — `apps/api` (API) and `apps/web` (dashboard). See [README.md](./README.md) for Vercel project settings.

---

## Testing

| Command | Scope |
|---------|-------|
| `bun test` | Vitest with in-memory PGlite |
| `bun run test:coverage` | Coverage report |
| `bun run test:neon` | Live Neon DB (needs `NEON_DATABASE_URL`) |

Agent and webhook behavior: `tests/agent/`, `tests/webhooks/`, `tests/lib/agent-runner.test.ts`.

---

## Related docs

- [agent.md](./agent.md) — AI agent design, tools, and runner
- [README.md](./README.md) — quick start and Vercel deploy tables
- [.env.example](./.env.example) — full variable list
