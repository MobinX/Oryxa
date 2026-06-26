# Oryxa

Multi-channel AI auto-reply SaaS for e-commerce. MVP: Facebook Messenger + Gemini agent + product catalog + orders.

## Stack

- **Monorepo:** Bun workspaces
- **API:** Hono + OpenAPI + Drizzle + Postgres
- **Web:** Next.js 15 + Tailwind + Firebase Auth (Google)
- **AI:** LangChain + Google Gemini 2.5 Flash-Lite
- **Files:** Backblaze B2 (S3-compatible API)

## Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh) 1.2+
- Postgres ([Neon](https://neon.tech) recommended)
- Firebase project with Google sign-in
- Meta Developer app (Messenger)
- Google AI Studio API key (Gemini)
- Backblaze B2 bucket + application key (S3-compatible)

### 2. Environment

```bash
cp .env.example .env
# Fill in all values
```

### 3. Install & database

```bash
bun install
bun run db:push
```

### 4. Run locally

```bash
# Terminal 1 — API (port 3001)
bun run dev:api

# Terminal 2 — Web (port 3400)
bun run dev:web
```

Open http://localhost:3400

### API via Next.js (`api2`)

Hono’s [Next.js integration](https://hono.dev/docs/getting-started/nextjs) mounts the shared `api` app with `handle()` from `hono/vercel` on App Router route handlers:

```bash
# apps/api2/.env.local → ../../.env (symlink; same secrets as API)
bun run dev:api2   # http://localhost:3500
```

If the web app should call **api2** instead of standalone `api`, set `NEXT_PUBLIC_API_URL` and `AGENT_RUNNER_URL` to the api2 URL (e.g. `http://localhost:3500`).

Routes: `/`, `/api/v1/*`, `/doc`, `/ui`, `/webhooks/*`, `/internal/*` — all served from `import { app } from '@repo/api/app'`.

### Build

```bash
# API only
bun run build:api

# Web only (Next.js production build)
bun run build:web

# Both apps
bun run build
```

Production start (after build):

```bash
bun run start:api   # API on API_PORT (default 3001)
bun run start:web   # Next.js on WEB_PORT (default 3400)
```

### API via Vercel CLI (local serverless simulation)

From repo root (requires [Vercel CLI](https://vercel.com/docs/cli)):

```bash
# One-time: symlink env into apps/api (gitignored)
ln -sf ../../.env apps/api/.env.local

bun run dev:api:vercel
```

Runs on http://localhost:3001 using `apps/api/api/index.ts` (Hono + `vercel dev`). For Bun hot reload locally use `bun run dev:api` (`src/bunServe.ts`).

If install fails with `Unsupported package manager specification`, ensure root `package.json` has **no** `packageManager` field — Vercel detects Bun from `bun.lock` instead.

### 5. Meta webhook (after deploy)

Set webhook URL to `https://your-api.vercel.app/webhooks/facebook` with verify token from `META_VERIFY_TOKEN`.

## Project structure

```
apps/api/          Hono API, webhooks, internal agent runner
apps/web/          Next.js dashboard
packages/db/       Drizzle schema + CRUD
packages/shared/   Zod schemas (single source of truth)
packages/agent/    LangChain + Gemini tools
packages/integrations/  Facebook OAuth + Send API
```

### Internal path aliases

Each package defines its own TypeScript `paths` so you avoid `../../` imports:

| Package | Alias | Example |
|---------|-------|---------|
| `packages/db` | `@db/*` | `import { db } from '@db/client'` |
| `packages/shared` | `@shared/*` | `import { uuidSchema } from '@shared/schemas/base'` |
| `packages/agent` | `@agent/*` | `import { Agent } from '@agent/Agent'` |
| `apps/api` | `@api/*` | `import { authMiddleware } from '@api/middleware/auth'` |
| `apps/web` | `@/*` | `import { Button } from '@/components/ui/button'` |

Cross-package imports still use workspace names: `@repo/db`, `@repo/shared`, etc.

Aliases are configured in each package's `tsconfig.json`. Bun resolves them at runtime; Vitest uses matching aliases in `vitest.config.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev:api` | Start API server |
| `bun run dev:web` | Start Next.js app |
| `bun run db:push` | Push schema to Postgres |
| `bun run db:studio` | Open Drizzle Studio |
| `bun test` | Run Vitest suite (PGlite in-memory DB) |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run test:neon` | Optional: run all Neon integration tests (`DATABASE_URL` or `NEON_DATABASE_URL` with a Neon URL) |
| `bun run test:neon:crud` | Optional: run only Neon CRUD tests (36 tests across all entities) |
| `bun run gen:api` | Generate React Query client from OpenAPI |

## Deploy (Vercel)

Two separate Vercel projects from the same Git repo.

### API project (`oryxa-api`)

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/api` |
| **Framework Preset** | Other |
| **Install Command** | `cd ../.. && bun install` |
| **Build Command** | `cd ../.. && bun install && bun --filter @repo/api build` |
| **Output Directory** | *(leave empty — Vercel handler is `public/index.js`)* |
| **Node.js Version** | 20.x |

The serverless entry re-exports `src/index.ts` (`export default handle(app)`). Local dev uses `src/bunServe.ts`. `bun run build:api` bundles TypeScript to:

- `apps/api/public/index.js` — Vercel serverless handler (`handle(app)`)
- `apps/api/public/server/index.js` — standalone Bun server (`bun run start:api`)

Source for the Vercel bundle is `api/index.ts` (re-exports `src/index.ts`). No copy step — deploy uses `public/index.js` directly.

**Production URLs to set in env:**

- `WEB_URL` → your web app URL (e.g. `https://oryxa-web.vercel.app`)
- `AGENT_RUNNER_URL` → this API URL (e.g. `https://oryxa-api.vercel.app`)
- `META_REDIRECT_URI` → `https://oryxa-api.vercel.app/api/v1/auth/facebook/callback`

Copy every other variable from `.env.example` into the Vercel project **Environment Variables** (Production + Preview).

For `FIREBASE_PRIVATE_KEY`, paste the key with real newlines, or use `\n` escapes — Vercel accepts both if the API reads it correctly.

**Meta webhook:** `https://oryxa-api.vercel.app/webhooks/facebook`

**Smoke test after deploy:**

```bash
curl https://your-api.vercel.app/
curl https://your-api.vercel.app/doc
```

### Web project (`oryxa-web`)

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js |
| **Install Command** | `cd ../.. && bun install` |
| **Build Command** | `cd ../.. && bun --filter web build` |

Set `NEXT_PUBLIC_API_URL` to the API Vercel URL. Other `NEXT_PUBLIC_FIREBASE_*` vars from Firebase console.

`apps/web/vercel.json` already mirrors these commands.

## External setup guides

1. **Neon:** Create project → copy pooled connection string → `DATABASE_URL`
2. **Firebase:** Enable Google provider → add web app credentials → create service account for API
3. **Meta:** Create app → add Messenger → connect test Page → set OAuth redirect to `/api/v1/auth/facebook/callback`
4. **Gemini:** https://aistudio.google.com/apikey → `GEMINI_API_KEY`
5. **Backblaze B2:** Create private bucket → application key → set `B2_*` env vars. Images use **presigned URLs** (no public bucket needed). See [B2 S3 API docs](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)

   **B2 bucket CORS (required for direct browser uploads):** variant images are uploaded straight from the browser to B2 via a presigned `PUT` URL (see `apps/web/lib/uploads-client.ts`). For the `PUT` to succeed from the web app's origin, add a CORS rule to the bucket (B2 dashboard → Bucket Settings → CORS):

   ```json
   {
     "corsRules": [
       {
         "allowedOrigins": ["https://your-web-domain"],
         "allowedMethods": ["PUT"],
         "allowedHeaders": ["Content-Type"],
         "exposeHeaders": ["ETag"],
         "maxAgeSeconds": 3600
       }
     ]
   }
   ```

   For local dev include `http://localhost:3400` in `allowedOrigins`. Without this rule, image signing succeeds but the browser `PUT` fails with a CORS error and the variant editor shows "Image upload failed: Upload to B2 failed: …". The presigned URL's signature binds the `Content-Type` header, so a client cannot lie about the MIME type — B2 rejects mismatched PUTs.
