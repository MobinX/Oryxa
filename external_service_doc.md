# External Service Integration — Complete API Guide

This is the operator/developer guide for the **external service** integration in OnlyOrders. It lets a
third-party service connect Facebook Pages through Oryxa, receive Messenger and comment events on
its own webhook URLs, reply to those events, and publish/manage Page posts — all with tokens that
stay inside OnlyOrders.

Everything in this document is live on production.

---

## 1. Overview

### What you get

1. Register an external service and a unique name for it.
2. Register one or more webhook URLs for that service.
3. Generate a Facebook Login URL with business + ads permissions. The user selects a Page; the
   Page tokens are banked internally and only the `pageId` + `pageName` are POSTed to your redirect.
4. Redeem the banked token with `connectChannel`; OnlyOrders stores the encrypted tokens and
   subscribes the Page to webhooks.
5. From then on:
   - every Messenger message / Page comment on that Page is fanned out to your webhooks;
   - you can reply with `SendMessage`, `sendCommentReply`, `SendMessageSeenReq`,
     `SendMessageTypingReq`;
   - you can create, read, comment-read, edit and delete Page posts.

### Architecture at a glance

```
User browser
   │  Facebook Login (client_id, scope, state)
   ▼
Facebook
   │  redirect to OnlyOrders /api/v1/auth/facebook/callback
   ▼
OnlyOrders API2
   │  302 → /api2/ext-service/internal_facebook_url?token=…
   │  banks Page tokens, then POSTs {businessId, pageName, pageId} to YOUR redirect
   ▼
Your service                     (you call connectChannel with pageId + businessId)
   │
   │  Meta sends Page events → OnlyOrders /webhooks/facebook
   ▼
OnlyOrders fan-out → YOUR webhook URL(s) → you call OnlyOrders send/post APIs
```

### Base URLs

The same Hono router is mounted in three places:

| Purpose | Base |
|---|---|
| API2 (recommended) | `https://onlyorders.tech/api2/ext-service` |
| Web proxy | `https://onlyorders.tech/api/ext-service` |
| Direct API2 project | `https://oryxa-api2.vercel.app/api2/ext-service` |

All paths below are relative to the chosen base. Examples use:

```sh
BASE=https://onlyorders.tech/api2/ext-service
```

> **Auth warning:** the external-service router currently has **no auth middleware**. Any caller
> who knows a service id can read or mutate it. Put an API-key/bearer check in front of it before
> exposing it to untrusted clients.

### Platform support

| Operation | facebook | instagram | whatsapp | telegram |
|---|---|---|---|---|
| Connect channel | ✅ | ✅ | ✅ (credentials) | ✅ (credentials) |
| Webhook fan-out | ✅ | ✅ (comments) | — | — |
| Send message / seen / typing | ✅ | ✅ | — | — |
| Comment reply | ✅ | ✅ | — | — |
| Create/read/update/delete post | ✅ | ❌ | ❌ | ❌ |

Unsupported platforms return HTTP `400` with a message such as
`"Post publishing is only supported for facebook"`.

---

## 2. Data model

| Table | Columns / purpose |
|---|---|
| `external_service` | `id` (uuid), `name`, `unique_name`, `created_at`, `updated_at`, `deleted_at` |
| `external_service_webhooks` | `id`, `service_id` → service, `webhook_url`, timestamps, `deleted_at` — many per service |
| `external_service_channel` | `id`, `service_id`, `name`, `platform`, `access_token`, `refresh_token`, `platform_channel_id` (Page id), timestamps, `deleted_at` — mirrors `channels` |
| `external_service_pending_page` | `business_id`, `page_id`, `page_name`, encrypted tokens, `expires_at` — banks tokens between callback and `connectChannel`; never exposed externally |
| `external_service_post` | `id`, `service_id`, `channel_id`, `platform`, `platform_post_id`, `platform_channel_id`, `text`, `media` (jsonb), timestamps, `deleted_at` — maps the post id you receive back to the token that owns it |

Soft delete is a `deleted_at` timestamp, consistent with the rest of the codebase — not a boolean
`isDeleted`. Deleted rows are excluded from every read and fan-out. Tokens reuse the
`v1:<iv>:<tag>:<ct>` encryption envelope from `channels` when `MESSAGES_ENCRYPTION_KEY` is set.

---

## 3. Quickstart — complete walkthrough

The following is the exact sequence used in the live production test.

### 3.1 Create a service

```sh
curl -X POST "$BASE/create" \
  -H 'content-type: application/json' \
  -d '{"name":"Live E2E Test","uniqueName":"live-e2e-001"}'
```

Response `201`:
```json
{
  "id": "eaa3b6c3-6608-402e-994f-906d04a0641f",
  "name": "Live E2E Test",
  "uniqueName": "live-e2e-001",
  "createdAt": "2026-11-20T10:34:28.262Z",
  "updatedAt": "2026-11-20T10:34:28.262Z"
}
```

Save the `id` as `SERVICE_ID`.

### 3.2 Register your webhook

```sh
curl -X POST "$BASE/$SERVICE_ID/webhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://your-service.example.com/webhook"}'
```

Response `201`:
```json
{
  "id": "6307114b-1c8e-4078-b4be-0c602bacbd10",
  "serviceId": "eaa3b6c3-6608-402e-994f-906d04a0641f",
  "url": "https://your-service.example.com/webhook",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 3.3 Generate the Facebook login URL

```sh
curl -X POST "$BASE/getFacebookConnectOauthUrl" \
  -H 'content-type: application/json' \
  -d '{"redirectUrl":"https://your-service.example.com/facebook-selected"}'
```

Response `200`:
```json
{
  "url": "https://www.facebook.com/v21.0/dialog/oauth?client_id=…&redirect_uri=…&scope=pages_messaging,pages_show_list,…,business_management,ads_read&state=…",
  "businessId": "bdcfcdbf-5c37-4100-a300-013c6bb9a944"
}
```

Send the user to `url`. After the Page selection, OnlyOrders POSTs to your redirect:

```json
{
  "businessId": "bdcfcdbf-5c37-4100-a300-013c6bb9a944",
  "pageName": "OryzaAdmin",
  "pageId": "714922981715376"
}
```

### 3.4 Connect the Page

```sh
curl -X POST "$BASE/$SERVICE_ID/connectChannel" \
  -H 'content-type: application/json' \
  -d '{
    "pageId":"714922981715376",
    "businessId":"bdcfcdbf-5c37-4100-a300-013c6bb9a944",
    "platform":"facebook",
    "name":"OryzaAdmin"
  }'
```

Response `200`:
```json
{
  "id": "15d73536-9829-4d51-b2f6-653b59966b98",
  "pageId": "714922981715376",
  "name": "OryzaAdmin",
  "platform": "facebook",
  "status": "connected",
  "webhookSubscribed": true
}
```

### 3.5 Receive a message and reply

Your webhook receives:
```json
{
  "payload_type": "message",
  "pageId": "714922981715376",
  "customerInfo": {
    "id": "9909041422529304",
    "name": "Mobin Chowdhury",
    "avatar": "https://platform-lookaside.fbsbx.com/…"
  },
  "payload": {"type":"text","text":"Test hello"}
}
```

You reply:
```sh
curl -X POST "$BASE/$SERVICE_ID/SendMessage" \
  -H 'content-type: application/json' \
  -d '{"pageId":"714922981715376","recipientId":"9909041422529304","message":"Hi!","platformType":"facebook"}'
# {"sent":true}
```

---

## 4. Endpoint reference

### 4.1 Services

| Method | Path | Body / query | Success |
|---|---|---|---|
| POST | `/create` | `{name, uniqueName}` | `201` service |
| GET | `/:id` | — | `200` service |
| PUT | `/:id` | partial `{name?, uniqueName?}` | `200` service |
| DELETE | `/:id` | — | `200` `{"deleted":true}` |
| GET | `/search?id=<uuid>` or `?uname=<name>` | — | `200` `{"items":[…]}` |
| GET | `/all?page=1&limit=20` | — | `200` `{items,page,limit,total}` |

Details:

- `uniqueName` must match `^[A-Za-z0-9._-]+$`, max 255 chars. A duplicate live name gives `409`.
- `PUT` with an empty body is accepted (only `updatedAt` changes); a non-existent id gives `404`.
- `search` with neither `id` nor `uname` gives `400`.
- `all` validates `page ≥ 1` and `1 ≤ limit ≤ 100`; invalid values give `400`.
- `DELETE` soft-deletes children too; reads afterwards give `404`.

### 4.2 Webhooks

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/:id/webhook` | `{url}` (must be a valid URL) | `201` webhook |
| GET | `/:id/webhook/:webhookId` | — | `200` webhook |
| PUT | `/:id/webhook/:webhookId` | `{url}` | `200` webhook |
| DELETE | `/:id/webhook/:webhookId` | — | `200` `{"deleted":true}` |

Unknown service/webhook → `404`.

### 4.3 Facebook OAuth

| Method | Path | Body / query |
|---|---|---|
| POST | `/getFacebookConnectOauthUrl` | `{redirectUrl, businessId?}` |
| GET | `/internal_facebook_url?token=…` | signed token from the callback (called by OnlyOrders, not by you) |

The generated URL always asks for `business_management` and `ads_read` in addition to the Page
messaging/management scopes. `businessId` is generated when omitted. The redirect target is
embedded in the signed state, so it survives the round trip to Facebook.

The callback redirect always uses the **request host** of the callback (e.g.
`https://oryxa-api2.vercel.app`), never a machine-local env value.

### 4.4 Connect channel

```json
{
  "pageId": "string, required",
  "businessId": "string, optional — disambiguates banked tokens",
  "platform": "facebook|instagram|whatsapp|telegram, default facebook",
  "accessToken": "string, optional — skips the OAuth bank",
  "refreshToken": "string, optional",
  "name": "string, optional"
}
```

- With no `accessToken`, the banked token from the OAuth flow is redeemed. If it has expired,
  the API returns `400` and you must restart the OAuth flow.
- For `facebook`, OnlyOrders verifies the token actually answers as `pageId` and subscribes the
  Page to webhooks (`webhookSubscribed` in the response).
- If the Page is already connected to a different service, response is `409`.

### 4.5 Sending

| Path | Required fields | Response |
|---|---|---|
| `/:id/SendMessage` | `pageId`, `recipientId`, (`message` or `mediaUrl`), `platformType?` | `{"sent":true}` |
| `/:id/sendCommentReply` | `pageId`, `commentId`, `message`, `postId?`, `platformType?` | `{"replied":true,"commentId":"…","replyId":"…"}` |
| `/:id/SendMessageSeenReq` | `pageId`, `recipientId`, `platformType?` | `{"sent":true}` |
| `/:id/SendMessageTypingReq` | `pageId`, `recipientId`, `platformType?` | `{"sent":true}` |

Media messages accept `mediaType` of `image`, `video`, `audio` or `file`; the URL must be publicly
reachable because Meta fetches it. Missing channel → `404`; unsupported platform → `400`.

### 4.6 Posts

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/:id/post` | `{pageId, platform, postContent:{text?, media?}}` | `201` `{postId,id,status:"created"}` |
| GET | `/:id/post/:postId` | — | `200` content + `stats` |
| GET | `/:id/post/:postId/comment` | — | `200` `{comments:[…]}` |
| PUT | `/:id/post/:postId` | `{text}` | `200` `{postId,updated:true,text}` |
| DELETE | `/:id/post/:postId` | — | `200` `{"deleted":true}` |

Create examples:

Text only:
```sh
curl -X POST "$BASE/$SERVICE_ID/post" -H 'content-type: application/json' -d '{
  "pageId":"714922981715376",
  "platform":"facebook",
  "postContent":{"text":"OnlyOrders external-service post test"}
}'
```

One image:
```json
{
  "pageId": "714922981715376",
  "platform": "facebook",
  "postContent": {
    "text": "Look at this",
    "media": [{"mediatype":"image","mediaUrl":"https://example.com/a.jpg"}]
  }
}
```

Several images (staged as unpublished photos, then attached to one feed post):
```json
{
  "pageId": "714922981715376",
  "platform": "facebook",
  "postContent": {
    "text": "Photo set",
    "media": [
      {"mediatype":"image","mediaUrl":"https://example.com/1.jpg"},
      {"mediatype":"image","mediaUrl":"https://example.com/2.jpg"},
      {"mediatype":"image","mediaUrl":"https://example.com/3.jpg"}
    ]
  }
}
```

Video:
```json
{
  "pageId": "714922981715376",
  "platform": "facebook",
  "postContent": {
    "text": "Demo",
    "media": [{"mediatype":"video","mediaUrl":"https://example.com/demo.mp4"}]
  }
}
```

Rules:

- `text` max 5000 chars; at least one of `text` or `media` is required; max 10 media items.
- `audio` and `file` media are rejected (`502`) — the Page feed API cannot publish them.
- Only `facebook` posts are supported; other platforms return `400`.
- The returned `postId` is the **platform post id** (e.g.
  `714922981715376_122187545474979433`). Store it; it is the key for all later post routes.
- A Meta failure returns `502` with the Graph API error message.

Read response example (from the live test):
```json
{
  "id": "714922981715376_122187550394979433",
  "platform": "facebook",
  "pageId": "714922981715376",
  "text": "OnlyOrders external-service inspection post — please like or comment to test stats.",
  "media": [],
  "createdAt": "2026-11-20T11:58:00+0000",
  "permalinkUrl": "https://www.facebook.com/122181224072979433/posts/122187550394979433",
  "stats": {"likeCount":0,"commentCount":1,"shareCount":0,"reachCount":0}
}
```

`stats.commentCount` is Meta's summary count (top-level comments). The `/comment` endpoint also
returns replies, so its array can be longer than `commentCount`:
```json
{
  "comments": [
    {
      "id": "122187550394979433_1190509710308834",
      "text": "Wow",
      "commenterId": "9909041422529304",
      "commenterName": "Mobin Chowdhury",
      "createdAt": "2026-11-20T11:59:06+0000",
      "likeCount": 0,
      "parentId": null
    },
    {
      "id": "122187550394979433_1455694603201170",
      "text": "Auto-reply from the OnlyOrders external-service test: thanks for your comment!",
      "commenterId": "714922981715376",
      "commenterName": "OryzaAdmin",
      "createdAt": "2026-11-20T11:59:11+0000",
      "likeCount": 0,
      "parentId": "122187550394979433_1190509710308834"
    }
  ]
}
```

Update:
```sh
curl -X PUT "$BASE/$SERVICE_ID/post/714922981715376_122187550394979433" \
  -H 'content-type: application/json' \
  -d '{"text":"OnlyOrders external-service post test — updated"}'
```
```json
{"postId":"714922981715376_122187550394979433","updated":true,"text":"OnlyOrders external-service post test — updated"}
```

Delete:
```sh
curl -X DELETE "$BASE/$SERVICE_ID/post/714922981715376_122187550394979433"
# {"deleted":true}
```
A later read returns `404 {"error":"Post not found"}`.

---

## 5. Webhook payload reference

All events are POSTed as JSON with `content-type: application/json` to **every** live webhook of
the owning service.

### Message — text

```json
{
  "payload_type": "message",
  "pageId": "714922981715376",
  "customerInfo": {
    "id": "9909041422529304",
    "name": "Mobin Chowdhury",
    "avatar": "https://platform-lookaside.fbsbx.com/platform/profilepic/?..."
  },
  "payload": {"type":"text","text":"Test hello"}
}
```

### Message — media

```json
{
  "payload_type": "message",
  "pageId": "714922981715376",
  "customerInfo": {"id":"9909041422529304","name":"Mobin Chowdhury","avatar":null},
  "payload": {
    "type": "media",
    "mediatype": "image",
    "mediaUrl": "https://cdn.example.com/photo.jpg",
    "text": "optional caption"
  }
}
```
`mediatype` ∈ `image | video | audio | file`. If Meta's profile lookup fails, `name`/`avatar`
are `null` — the event is still delivered.

### Comment (Facebook feed)

```json
{
  "payload_type": "comment",
  "pageId": "714922981715376",
  "customerInfo": {"id":"9909041422529304","name":"Mobin Chowdhury","avatar":null},
  "payload": {
    "type":"text",
    "text":"Test comment",
    "commentId":"122181409862979433_1419190100296746",
    "postId":"714922981715376_122181409862979433"
  }
}
```

### Comment (Instagram)

Same shape; `commenterName` comes from the Instagram username and `postId` from the media id.

### Delivery rules

- Echoes (`message.is_echo`) and events where the sender is the Page itself are ignored.
- Fan-out runs **before** store-channel resolution, so an external service receives events even
  when no internal merchant channel exists for that Page.
- Delivery is best-effort: `Promise.allSettled`, 10 s timeout per webhook. A dead endpoint is
  logged and skipped; other endpoints and the store flow continue.
- The webhook handler always acknowledges Meta with `200` first, then processes in the background.

### Minimal webhook receiver (Bun/Node)

```ts
const BASE = 'https://onlyorders.tech/api2/ext-service';
const SERVICE_ID = process.env.SERVICE_ID!;

Bun.serve({
  port: 8787,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/facebook-selected' && req.method === 'POST') {
      const { businessId, pageName, pageId } = await req.json();
      console.log({ businessId, pageName, pageId });
      return Response.json({ received: true });
    }
    if (url.pathname === '/webhook' && req.method === 'POST') {
      const event = await req.json();
      const pageId = event.pageId;
      if (event.payload_type === 'message' && event.customerInfo?.id) {
        const recipientId = event.customerInfo.id;
        await fetch(`${BASE}/${SERVICE_ID}/SendMessageSeenReq`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pageId, recipientId, platformType: 'facebook' }),
        });
        await fetch(`${BASE}/${SERVICE_ID}/SendMessageTypingReq`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pageId, recipientId, platformType: 'facebook' }),
        });
        await fetch(`${BASE}/${SERVICE_ID}/SendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pageId, recipientId, platformType: 'facebook', message: 'Thanks for your message!' }),
        });
      } else if (event.payload_type === 'comment' && event.payload?.commentId) {
        await fetch(`${BASE}/${SERVICE_ID}/sendCommentReply`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pageId, postId: event.payload.postId, commentId: event.payload.commentId,
            platformType: 'facebook', message: 'Thanks for your comment!',
          }),
        });
      }
      return Response.json({ received: true });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  },
});
```

Expose it publicly with a Cloudflare quick tunnel:

```sh
cloudflared tunnel --url http://localhost:8787
# use the printed https://<name>.trycloudflare.com URL as redirectUrl / webhook URL
```

---

## 6. Error reference

| Status | Meaning | Typical fix |
|---|---|---|
| `400` | Invalid body/query, missing required field, unsupported platform, expired pending token | Check the `details.fieldErrors` in the response |
| `404` | Service, webhook, channel, or post not found (or soft-deleted) | Verify the id; reconnect the channel if needed |
| `409` | `uniqueName` already used, or Page already connected to another service | Choose another name / disconnect first |
| `502` | Meta Graph API call failed | Read the returned error message; check Page permissions/token expiry |

Validation errors include Zod field details, for example:
```json
{
  "error": "Invalid body",
  "details": {"formErrors":[],"fieldErrors":{"name":["Required"],"uniqueName":["Required"]}}
}
```

---

## 7. Migrations and deployment

- `0059_external_services.sql` — services, webhooks, channels, pending pages.
- `0060_external_service_posts.sql` — post mapping table.
- Both are idempotent (`IF NOT EXISTS`) and recorded in `drizzle.__drizzle_migrations`.
- Production had older migrations applied outside the journal; `0058_assistant_chat.sql` was
  applied separately to add `plans.assistant_limit` and `businesses.assistant_limit_override`.
- The web app exposes the router through a proxy at `apps/web/app/api/ext-service/[[...route]]/route.ts`.
  API2 uses `apps/api2/app/api2/ext-service/[[...route]]/route.ts` and
  `apps/api2/app/api/ext-service/[[...route]]/route.ts`, both re-exporting the shared Hono handler.

---

## 8. Tests and local verification

Test suites:

| File | Covers |
|---|---|
| `tests/api/ext-service.test.ts` | service/webhook CRUD, search, pagination, OAuth → connect, sending, posts |
| `tests/webhooks/ext-service-forward.test.ts` | webhook fan-out for text, media, feed comments, Instagram comments |
| `tests/web/ext-service-proxy.test.ts` | Next.js `/api/ext-service/*` proxy forwarding |

Run them (Node 24 is required on this machine because Bun's Vitest config loader fails under the
default Node 18):

```sh
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$PATH"
cd /home/ubuntu/Oryxa
DOTENV_CONFIG_PATH=/dev/null ./node_modules/.bin/vitest run \
  tests/api/ext-service.test.ts \
  tests/webhooks/ext-service-forward.test.ts \
  tests/web/ext-service-proxy.test.ts
```

Builds:
```sh
bun --filter @repo/api build
bun --filter web build
bun --filter api2 build
```

---

## 9. Known caveats / hardening checklist

1. **Auth** — no authentication on these routes today. Add a shared secret or bearer check.
2. **URL validation** — `redirectUrl` and webhook URLs are caller-supplied; add an allowlist or
   private-network block before accepting untrusted input (SSRF).
3. **Soft delete** — use `deleted_at`, not a boolean; deleted rows never appear in reads or fan-out.
4. **Token privacy** — external redirects receive only `pageName`/`pageId`; tokens stay in the
   `external_service_pending_page` / `external_service_channel` tables, encrypted at rest.
5. **Post editing** — Meta only allows editing a post's text, never its attachments.
6. **Stats origin** — stats are read live from Meta, so zero values are normal for a brand-new post.
7. **Deployment protection** — per-deployment Vercel URLs (`*.vercel.app`) are behind Vercel Login;
   use `https://onlyorders.tech` for live checks.
