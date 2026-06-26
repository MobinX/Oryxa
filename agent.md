# Oryxa — AI Agent

The sales agent replies to Facebook Messenger customers using **Google Gemini 2.5 Flash-Lite**, **LangGraph ReAct**, and tools that search products, create orders, and send messages.

Implementation lives in `packages/agent/`. Orchestration (when to run, DB updates, re-queue) lives in `apps/api/src/lib/agent-runner.ts`.

---

## High-level flow

```
Customer sends Messenger text
        │
        ▼
POST /webhooks/facebook
        │
        ├─ getChannelByPageId(pageId)
        ├─ processInboundMessage → conversation + message in DB
        └─ if channel has agentId → triggerAgentRun(conversationId)
                    │
                    ▼
        POST {AGENT_RUNNER_URL}/internal/run
        Header: x-internal-key: {INTERNAL_KEY}
        Body: { "conversationId": "..." }
                    │
                    ▼
        runAgentForConversation(conversationId)
        ├─ load conversation, channel, agent, message history
        ├─ set conversation state → working
        ├─ build catalog preview (top 10 products)
        ├─ new Agent({ ... }).run()
        ├─ save AI reply as message (from: self)
        └─ set state → done; re-trigger if more pending customer messages
```

The webhook returns `200` immediately. The agent runs asynchronously so Meta does not time out.

On **Vercel**, `/internal/run` uses `executionCtx.waitUntil()` so the serverless function stays alive for the agent run. On **Bun dev**, the handler fires the promise and returns `202 accepted`.

---

## Core components

### `Agent` (`packages/agent/Agent.ts`)

- **Model:** `ChatGoogleGenerativeAI` — `gemini-2.5-flash-lite`, temperature `0.3`
- **Framework:** `createReactAgent` from `@langchain/langgraph/prebuilt`
- **System prompt:** per-business agent row (`agents.system_prompt`) plus business name, description, and catalog preview
- **History:** conversation messages mapped to `HumanMessage` (customer) / `AIMessage` (self)

```ts
import { Agent } from '@repo/agent';

const agent = new Agent({
  systemPrompt: 'You are a friendly sales assistant…',
  business: { id, name, description },
  history: [{ from: 'customer' | 'self', content: string }],
  conversationId,
  pageToken,           // Facebook page access token (from channel)
  customerPlatformId,  // Messenger PSID
  customerName,
  catalogSummary,      // optional text block of products
  llm,                 // optional — inject fake LLM in tests
});

const text = await agent.run();
```

### Tools (`packages/agent/tools/index.ts`)

| Tool | Description |
|------|-------------|
| `get_product` | Search catalog by name or SKU (`searchProducts`, limit 5) |
| `create_order` | Create order linked to conversation (`createOrder` CRUD) |
| `send_message` | Send text to customer via Facebook Send API |

The system prompt instructs the model to **always use `send_message`** for the customer-facing reply.

Tool context is bound per run: `businessId`, `conversationId`, `pageToken`, `customerPlatformId`, `customerName`.

### Agent runner (`apps/api/src/lib/agent-runner.ts`)

| Function | Role |
|----------|------|
| `triggerAgentRun(conversationId)` | HTTP POST to `/internal/run` (non-blocking) |
| `runAgentForConversation(conversationId)` | Full run: DB load → Agent → persist reply → state machine |

**Conversation states:** `pending` → `working` → `done`. If new customer messages arrive while `working`, they stay `pending` until the current run finishes; `checkPendingMessages` may trigger another run.

### Internal route (`apps/api/src/routes/internal/run.ts`)

- Path: `POST /internal/run`
- Auth: `x-internal-key` must equal `INTERNAL_KEY`
- Body: `{ conversationId: uuid }` (`internalRunInputSchema` from `@repo/shared`)

---

## Database configuration

Each business can have **agents** and **channels**:

```
agents
  id, businessId, name, systemPrompt, platformType

channels
  id, businessId, platform, apiToken, platformChannelId, agentId
```

**Setup in the dashboard**

1. Open business → **Channels**
2. Create an agent (name + system prompt)
3. Connect Facebook Page (OAuth) — stores page token on channel
4. Assign agent to channel

Without `channel.agentId`, inbound messages are stored but **no agent is triggered**.

Default system prompt (channels UI) emphasizes product help and order confirmation before `create_order`.

---

## Environment variables

Set in **root `.env`** (and available to api2 via symlink).

| Variable | Used by | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | `Agent` | Google AI Studio key |
| `AGENT_RUNNER_URL` | `triggerAgentRun` | Base URL for `/internal/run` (usually same API host) |
| `INTERNAL_KEY` | webhook trigger + `/internal/run` | Shared secret — use a long random string |
| `META_APP_ID`, `META_APP_SECRET` | integrations | Send API + webhook signature |
| `DATABASE_URL` | tools + runner | Product search, orders, conversations |

**Local defaults**

```env
AGENT_RUNNER_URL=http://localhost:3001
INTERNAL_KEY=change-me-to-random-secret
GEMINI_API_KEY=...
```

If you run **api2** on port 3500 as the only API:

```env
AGENT_RUNNER_URL=http://localhost:3500
```

`NEXT_PUBLIC_API_URL` in web does **not** affect the agent — only the dashboard. The agent is triggered server-side.

---

## Local development checklist

1. Root `.env` filled (`GEMINI_API_KEY`, `INTERNAL_KEY`, `AGENT_RUNNER_URL`, `DATABASE_URL`, Meta vars)
2. `apps/api2/.env.local` → `../../.env` if using api2; otherwise `bun run dev:api`
3. `bun run db:push`
4. API running and reachable at `AGENT_RUNNER_URL`
5. Business with products, agent, and Facebook channel connected
6. Meta webhook pointing to `https://<public-api>/webhooks/facebook` (use ngrok/Codespaces tunnel for local Meta testing)

**Smoke test internal runner**

```bash
curl -X POST http://localhost:3001/internal/run \
  -H "Content-Type: application/json" \
  -H "x-internal-key: $INTERNAL_KEY" \
  -d '{"conversationId":"<uuid-from-db>"}'
```

---

## Customization

### Change model or temperature

Edit `packages/agent/Agent.ts` — `ChatGoogleGenerativeAI` constructor (`model`, `temperature`).

### Add a tool

1. Add a function in `packages/agent/tools/index.ts` using `tool()` from `@langchain/core/tools`
2. Register it in the array returned by `createAgentTools`
3. Update the agent system prompt if the model needs guidance on when to use it
4. Add tests in `tests/agent/tools.test.ts`

### Per-channel behavior

Store different `systemPrompt` values on multiple `agents` rows and assign agents to channels independently.

### Test without Gemini

Pass `llm` in `AgentConfig` or use the fake LLM helpers in `tests/helpers/fake-llm.ts`:

```bash
bun test tests/agent
bun test tests/lib/agent-runner.test.ts
bun test tests/webhooks/facebook.test.ts
```

Tests mock Facebook `sendMessage` and inject a deterministic LLM so no API keys are required in CI.

---

## Failure behavior

| Failure | Behavior |
|---------|----------|
| Invalid `INTERNAL_KEY` on `/internal/run` | `401 Unauthorized` |
| Agent throws (Gemini error, tool error) | Logged; conversation state set to `done` |
| Channel not found for page ID | Webhook returns `200` (ignored) |
| No agent on channel | Message stored; no `triggerAgentRun` |

Pending customer messages after a run complete trigger another `triggerAgentRun` automatically.

---

## File reference

| Path | Description |
|------|-------------|
| `packages/agent/Agent.ts` | LangGraph agent + Gemini |
| `packages/agent/tools/index.ts` | `get_product`, `create_order`, `send_message` |
| `packages/agent/index.ts` | Package exports |
| `apps/api/src/lib/agent-runner.ts` | Trigger + run orchestration |
| `apps/api/src/routes/internal/run.ts` | HTTP entry for runs |
| `apps/api/src/webhooks/facebook.ts` | Inbound Messenger → trigger |
| `apps/web/app/b/[businessId]/channels/page.tsx` | UI to create agents + connect Facebook |

---

## Related

- [architecture.md](./architecture.md) — monorepo layout, env files, init steps
- [README.md](./README.md) — Meta webhook URL and deploy notes
