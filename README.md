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

   ### B2 bucket CORS (required for direct browser uploads)

   Variant images are uploaded **straight from the browser to B2** via a presigned `PUT` URL (see `apps/web/lib/uploads-client.ts`), and displayed via presigned `GET` URLs. Both are cross-origin requests from the web app, so the bucket must have CORS rules that explicitly allow them. Without a `PUT` rule the browser blocks the upload with a generic `TypeError: Failed to fetch` (the sign step succeeds, but the PUT is rejected at the CORS preflight).

   B2 CORS rules map S3-style operations to B2 operations. The operations this app needs:

   | Operation        | Used for                                              |
   |------------------|-------------------------------------------------------|
   | `s3_get`         | Browser fetches presigned GET URLs to display images |
   | `s3_head`        | Browser HEAD checks on presigned GET URLs            |
   | `s3_put`         | Browser PUTs bytes to the presigned upload URL       |
   | `b2_download_file_by_id`, `b2_download_file_by_name` | Native B2 downloads (optional, kept for compatibility) |

   #### Rules needed

   **Download from any origin** (`s3_get` + `s3_head` from `*`):

   ```json
   {
     "corsRuleName": "s3DownloadFromAnyOrigin",
     "allowedOrigins": ["*"],
     "allowedOperations": ["s3_get", "s3_head"],
     "allowedHeaders": ["authorization", "range"],
     "exposeHeaders": [],
     "maxAgeSeconds": 3600
   }
   ```

   **PUT from any origin** (`s3_put` from `*` — required for direct browser uploads):

   ```json
   {
     "corsRuleName": "s3PutFromAnyOrigin",
     "allowedOrigins": ["*"],
     "allowedOperations": ["s3_put"],
     "allowedHeaders": ["content-type", "x-amz-content-sha256", "x-amz-date", "authorization"],
     "exposeHeaders": ["etag", "x-amz-request-id"],
     "maxAgeSeconds": 3600
   }
   ```

   > **Production hardening:** replace `"*"` in `allowedOrigins` with your exact web origin(s) (e.g. `https://oryxa-web.vercel.app`, plus `http://localhost:3400` for local dev). Using `*` is convenient for GitHub Codespaces (whose `*.app.github.dev` URLs change per session) but allows any site to issue authenticated PUTs against presigned URLs — presigned URLs are short-lived (5 min) and content-type-bound, so the risk is limited, but locking the origin is best practice.

   #### How to update CORS

   You can set CORS either from the **B2 web dashboard** or with the **B2 native API** via curl. The API approach is scriptable and is what was used to configure this project's bucket.

   ##### Option A — B2 web dashboard

   1. Sign in to https://secure.backblazeb2.com → **B2 Cloud Storage** → find your bucket (`B2_BUCKET_NAME`).
   2. Open the bucket → **Bucket Settings** → **CORS Rules** → **Edit**.
   3. Paste the rules from above (as a JSON array under `corsRules`) and save.

   ##### Option B — B2 native API (curl)

   The credentials come from your `.env` (`B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`). The flow is: `b2_authorize_account` → `b2_list_buckets` (to get the `bucketId`) → `b2_update_bucket` (to set the full `corsRules` array).

   ```bash
   set -a && . .env && set +a

   # 1. Authorize — get apiUrl, authorizationToken, accountId
   AUTH=$(curl -s -u "$B2_KEY_ID:$B2_APPLICATION_KEY" \
     https://api.backblazeb2.com/b2api/v3/b2_authorize_account)
   API_URL=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['apiInfo']['storageApi']['apiUrl'])")
   TOKEN=$(echo "$AUTH"   | python3 -c "import sys,json;print(json.load(sys.stdin)['authorizationToken'])")
   ACCT=$(echo "$AUTH"    | python3 -c "import sys,json;print(json.load(sys.stdin)['accountId'])")

   # 2. Look up the bucketId for B2_BUCKET_NAME
   BUCKET_ID=$(curl -s -X POST "$API_URL/b2api/v3/b2_list_buckets" \
     -H "Authorization: $TOKEN" \
     -d "{\"accountId\":\"$ACCT\",\"bucketName\":\"$B2_BUCKET_NAME\"}" \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['buckets'][0]['bucketId'])")

   # 3. Update CORS — send the COMPLETE corsRules array (this replaces all rules)
   curl -s -X POST "$API_URL/b2api/v3/b2_update_bucket" \
     -H "Authorization: $TOKEN" \
     -d '{
       "accountId": "'"$ACCT"'",
       "bucketId": "'"$BUCKET_ID"'",
       "bucketType": "allPrivate",
       "corsRules": [
         {
           "corsRuleName": "downloadFromAnyOrigin",
           "allowedOrigins": ["*"],
           "allowedOperations": ["b2_download_file_by_id", "b2_download_file_by_name"],
           "allowedHeaders": ["authorization", "range"],
           "exposeHeaders": null,
           "maxAgeSeconds": 3600
         },
         {
           "corsRuleName": "s3DownloadFromAnyOrigin",
           "allowedOrigins": ["*"],
           "allowedOperations": ["s3_get", "s3_head"],
           "allowedHeaders": ["authorization", "range"],
           "exposeHeaders": null,
           "maxAgeSeconds": 3600
         },
         {
           "corsRuleName": "s3PutFromAnyOrigin",
           "allowedOrigins": ["*"],
           "allowedOperations": ["s3_put"],
           "allowedHeaders": ["content-type", "x-amz-content-sha256", "x-amz-date", "authorization"],
           "exposeHeaders": ["etag", "x-amz-request-id"],
           "maxAgeSeconds": 3600
         }
       ]
     }' | python3 -m json.tool
   ```

   ##### Verify the current CORS rules

   ```bash
   set -a && . .env && set +a
   AUTH=$(curl -s -u "$B2_KEY_ID:$B2_APPLICATION_KEY" https://api.backblazeb2.com/b2api/v3/b2_authorize_account)
   API_URL=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['apiInfo']['storageApi']['apiUrl'])")
   TOKEN=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['authorizationToken'])")
   ACCT=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['accountId'])")
   curl -s -X POST "$API_URL/b2api/v3/b2_list_buckets" \
     -H "Authorization: $TOKEN" \
     -d "{\"accountId\":\"$ACCT\",\"bucketName\":\"$B2_BUCKET_NAME\"}" \
     | python3 -c "import sys,json;b=json.load(sys.stdin)['buckets'][0];print(json.dumps(b.get('corsRules',[]),indent=2))"
   ```

   #### Notes

   - `b2_update_bucket` **replaces the entire `corsRules` array** — always send the full set of rules you want, including the existing download rules, or you will remove them.
   - `b2_update_bucket` requires `accountId`, `bucketId`, and `bucketType` (use `allPrivate` for a private bucket).
   - The presigned PUT URL's signature binds the `Content-Type` header, so a client cannot lie about the MIME type — B2 rejects mismatched PUTs with 403.
   - After changing CORS, browsers may cache the preflight result for up to `maxAgeSeconds`; if a PUT still fails right after a rule change, do a hard refresh or wait for the cache to expire.
