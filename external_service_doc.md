# External Service Integration — API Guide

This document describes the **external service** integration: how a third-party service registers,
connects Facebook Pages, receives Messenger/comment events on its own webhook, sends replies, and
creates/reads/edits/deletes Page posts through OnlyOrders.

## Base URLs

The same router is mounted in three places:

| Purpose | Base URL |
|---|---|
| API2 (preferred) | `https://onlyorders.tech/api2/ext-service` |
| Web proxy | `https://onlyorders.tech/api/ext-service` |
| Direct API2 project | `https://oryxa-api2.vercel.app/api2/ext-service` |

Every path below is relative to one of those bases. Examples use the API2 base.

> **Auth:** the external-service router currently has no auth middleware. Any caller that knows a
> service id can use it. Add an API-key/bearer gate before exposing it to untrusted clients.

## Data model

| Table | Purpose |
|---|---|
| `external_service` | The integration itself (`id`, `name`, `unique_name`, timestamps, `deleted_at`). |
| `external_service_webhooks` | One or more callback URLs per service (soft-deletable). |
| `external_service_channel` | A connected platform account (`platform`, page/account id, encrypted access/refresh token). |
| `external_service_pending_page` | Short-lived token bank between the Facebook callback and `connectChannel`. Tokens are never sent to the external redirect. |
| `external_service_post` | Maps a platform post id back to the service/channel that owns it, so posts can be read/updated/deleted. |

Soft delete is a `deleted_at` timestamp (matching the existing `channels` table), not a boolean.

Supported platforms for channels: `facebook`, `instagram`, `whatsapp`, `telegram`.
Posts and sending are currently implemented for **`facebook` only**; other platforms get HTTP 400.

---

## 1. Service CRUD

### Create
```http
POST /create
Content-Type: application/json

{ "name": "Acme Integration", "uniqueName": "acme" }
```
`201` → `{ "id", "name", "uniqueName", "createdAt", "updatedAt" }`.
`uniqueName` must match `^[A-Za-z0-9._-]+$`. A duplicate live name returns `409`.

### Read / Update / Delete
```http
GET    /:id
PUT    /:id          { "name": "...", "uniqueName": "..." }   # partial
DELETE /:id                                                   # soft delete
```
Delete also soft-deletes the service's webhooks and channels.

### Search
```http
GET /search?id=<uuid>
GET /search?uname=<unique_name>
```
→ `{ "items": [ service, ... ] }`. Passing neither returns `400`.

### List (paginated)
```http
GET /all?page=1&limit=20
```
→ `{ "items": [...], "page": 1, "limit": 20, "total": 42 }`. `limit` max is 100.

---

## 2. Webhook CRUD

```http
POST   /:id/webhook              { "url": "https://example.com/hook" }
GET    /:id/webhook/:webhookId
PUT    /:id/webhook/:webhookId   { "url": "https://example.com/new" }
DELETE /:id/webhook/:webhookId
```
A service may have several live webhooks; all of them receive every event.

---

## 3. Facebook Page connection (OAuth)

### 3.1 Generate the login URL
```http
POST /getFacebookConnectOauthUrl
{ "redirectUrl": "https://your-service.example.com/facebook-selected" }
```
`200` →:
```json
{
  "url": "https://www.facebook.com/v21.0/dialog/oauth?...&state=...",
  "businessId": "<generated tenant id>"
}
```
The URL requests business + ads permissions (`business_management`, `ads_read`,
`pages_messaging`, …). You may also pass `businessId` to supply your own tenant id.

### 3.2 User picks a Page
Send the user to `url`. After the Facebook login, OnlyOrders redirects through:
```
/api2/ext-service/internal_facebook_url?token=<short-lived signed token>
```
That endpoint banks the Page tokens internally and POSTs to your `redirectUrl`:
```json
{
  "businessId": "...",
  "pageName": "OryzaAdmin",
  "pageId": "714922981715376"
}
```
No access token is ever sent to your redirect. The response of `internal_facebook_url` is
`{ businessId, posted: [...], failed: [...] }`.

### 3.3 Connect the Page to the service
```http
POST /:id/connectChannel
{
  "pageId": "714922981715376",
  "businessId": "<from step 3.2>",
  "platform": "facebook",
  "name": "OryzaAdmin"
}
```
`200` → `{ id, pageId, name, platform, status: "connected", webhookSubscribed: true }`.

The token banked in 3.2 is redeemed, verified with Meta, stored encrypted, and the Page is
subscribed to webhooks. A `409` means that Page is already connected to another service.

You can also connect directly by passing `accessToken` (and optional `refreshToken`) instead of
relying on the OAuth bank.

---

## 4. Inbound webhook payload

For every Messenger message or Page comment on a connected Page, OnlyOrders POSTs this to **all**
live webhooks of the owning service:

```json
{
  "payload_type": "message",
  "pageId": "714922981715376",
  "customerInfo": {
    "id": "9909041422529304",
    "name": "Mobin Chowdhury",
    "avatar": "https://platform-lookaside.fbsbx.com/..."
  },
  "payload": { "type": "text", "text": "Test hello" }
}
```

Media message:
```json
{
  "payload_type": "message",
  "pageId": "...",
  "customerInfo": { "id": "...", "name": "...", "avatar": null },
  "payload": {
    "type": "media",
    "mediatype": "image",
    "mediaUrl": "https://...",
    "text": "optional caption"
  }
}
```
`mediatype` is one of `image`, `video`, `audio`, `file`.

Comment:
```json
{
  "payload_type": "comment",
  "pageId": "...",
  "customerInfo": { "id": "...", "name": "Mobin Chowdhury", "avatar": null },
  "payload": {
    "type": "text",
    "text": "Test comment",
    "commentId": "<comment id>",
    "postId": "<post id>"
  }
}
```

Delivery is best-effort (`Promise.allSettled`, 10 s timeout). One failing webhook never blocks the
others or the store's own message flow.

---

## 5. Sending

All bodies accept `pageId`, `platformType` (`facebook` by default) and:

### Send a message (text or media)
```http
POST /:id/SendMessage
{
  "pageId": "...",
  "recipientId": "<Messenger PSID>",
  "message": "Hello",
  "mediaUrl": "https://...",     # optional, mutually exclusive with message
  "mediaType": "image",          # image|video|audio|file
  "platformType": "facebook"
}
```
→ `{ "sent": true }`.

### Reply to a comment
```http
POST /:id/sendCommentReply
{ "pageId": "...", "postId": "...", "commentId": "...", "message": "Thanks!", "platformType": "facebook" }
```
→ `{ "replied": true, "commentId": "...", "replyId": "..." }`.

### Seen / typing
```http
POST /:id/SendMessageSeenReq      { "pageId": "...", "recipientId": "...", "platformType": "facebook" }
POST /:id/SendMessageTypingReq    { "pageId": "...", "recipientId": "...", "platformType": "facebook" }
```
→ `{ "sent": true }`.

A page that is not connected to the service returns `404`.

---

## 6. Posts

### Create
```http
POST /:id/post
{
  "pageId": "714922981715376",
  "platform": "facebook",
  "postContent": {
    "text": "Hello from the external service",
    "media": [
      { "mediatype": "image", "mediaUrl": "https://example.com/a.jpg" }
    ]
  }
}
```
`201` → `{ "postId": "<platform post id>", "id": "<same>", "status": "created" }`.

Behaviour:
- text only → `/{page}/feed`
- one image → `/{page}/photos`
- several images → staged as unpublished photos, then attached to one feed post
- one video → `/{page}/videos`
- `audio`/`file` media → `502` (Meta's Page feed does not support them)
- at least one of `text` or `media` is required; max 10 media items.

### Read (content + stats)
```http
GET /:id/post/:postId
```
→
```json
{
  "id": "...",
  "platform": "facebook",
  "pageId": "...",
  "text": "...",
  "media": [],
  "createdAt": "2026-11-20T11:30:54+0000",
  "permalinkUrl": "https://www.facebook.com/.../posts/...",
  "stats": { "likeCount": 0, "commentCount": 1, "shareCount": 0, "reachCount": 0 }
}
```

### Read comments
```http
GET /:id/post/:postId/comment
```
→
```json
{
  "comments": [
    {
      "id": "...",
      "text": "Wow",
      "commenterId": "...",
      "commenterName": "Mobin Chowdhury",
      "createdAt": "...",
      "likeCount": 0,
      "parentId": null
    }
  ]
}
```
`parentId` is set on replies. `stats.commentCount` is Meta's summary count (top-level comments).

### Update / Delete
```http
PUT    /:id/post/:postId    { "text": "Edited text" }
DELETE /:id/post/:postId
```
Meta only allows editing a post's text, not its attachments.
`200` → `{ "postId": "...", "updated": true, "text": "..." }` / `{ "deleted": true }`.
After deletion, reads return `404`.

Unknown post ids, or posts belonging to another service, return `404`.

---

## 7. Database migrations

The feature uses migrations `0059_external_services.sql` (services, webhooks, channels, pending
pages) and `0060_external_service_posts.sql` (post mapping). Both are idempotent and recorded in
`drizzle.__drizzle_migrations`. Note that production had older migrations applied outside the
journal; `0058_assistant_chat.sql` was applied separately to fix missing `assistant_limit` columns.

## 8. Tests

- `tests/api/ext-service.test.ts` — service/webhook CRUD, OAuth → connect, sending, posts.
- `tests/webhooks/ext-service-forward.test.ts` — webhook fan-out for messages, media, comments.
- `tests/web/ext-service-proxy.test.ts` — the `/api/ext-service/*` Next.js proxy.

Run with Node 24 (Bun's Vitest config loader fails under the default Node 18 on this box):
```sh
PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$PATH" \
DOTENV_CONFIG_PATH=/dev/null ./node_modules/.bin/vitest run tests/api/ext-service.test.ts \
  tests/webhooks/ext-service-forward.test.ts tests/web/ext-service-proxy.test.ts
```
