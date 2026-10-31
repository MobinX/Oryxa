# @repo/mail — OnlyOrders mail Worker

Cloudflare Worker for inbound mail (Email Routing `email()` handler), outbound mail (Brevo transactional API, optional Sender.net fallback), D1 metadata, and Backblaze B2 storage.

## Architecture

```
inbound SMTP -> Cloudflare Email Routing -> Worker email()
                                             |-> parse MIME (postal-mime)
                                             |-> B2: emails/{mailboxId}/{emailId}/...
                                             |-> D1: emails row (metadata + JSON key)

HTTP client -> Worker /api/emails/send -> Brevo API (or Sender.net when configured)
                                       |-> B2 JSON + attachments
                                       |-> D1 metadata (rollback if provider fails)
```

Brevo attachments are sent as base64. When the Sender.net fallback is selected, its
attachments are passed as short-lived presigned B2 HTTPS URLs.

B2 holds the full email JSON and every attachment. D1 holds only the mandatory index
fields plus the B2 JSON key/link and byte counter.

## D1 schema

`mailboxes`

| column | type | notes |
| --- | --- | --- |
| id | TEXT PK | UUID |
| address | TEXT UNIQUE | lowercased email, owner identity |
| name | TEXT | optional display name |
| created_at / updated_at | TEXT | ISO-8601 |

`emails`

| column | type | notes |
| --- | --- | --- |
| id | TEXT PK | UUID |
| mailbox_id | TEXT | FK to mailboxes |
| direction | TEXT | `inbound` or `outbound` |
| from_email / from_name | TEXT | sender |
| to_email | TEXT | primary recipient |
| subject | TEXT | |
| message_id | TEXT | unique per mailbox, used for inbound dedupe |
| provider | TEXT | `cloudflare-email-routing`, `sender.net` or `brevo` |
| provider_message_id | TEXT | provider email id |
| json_key | TEXT | B2 object key of the email JSON |
| json_url | TEXT | stable Worker URL (`/api/emails/:id/content`) |
| size_bytes | INTEGER | JSON bytes + all attachment bytes |
| attachment_count | INTEGER | |
| status | TEXT | `received`, `sending`, `sent`, `failed` |
| is_trashed | INTEGER | 0/1 |
| trashed_at | TEXT | |
| received_at / created_at | TEXT | ISO-8601 |

Indexes: mailbox timeline, mailbox+trash, unique `(mailbox_id, message_id)`.

## B2 layout and JSON

```
emails/{mailboxId}/{emailId}/email.json
emails/{mailboxId}/{emailId}/attachments/{attachmentId}-{safeFilename}
```

`email.json`:

```json
{
  "version": 1,
  "id": "uuid",
  "mailboxId": "uuid",
  "direction": "inbound",
  "messageId": "<...>",
  "inReplyTo": null,
  "references": [],
  "from": { "email": "alice@example.com", "name": "Alice" },
  "to": [{ "email": "inbox@onlyorders.tech", "name": "" }],
  "cc": [],
  "bcc": [],
  "replyTo": [],
  "subject": "Hello",
  "date": "2026-10-31T12:00:00.000Z",
  "receivedAt": "2026-10-31T12:00:01.000Z",
  "text": "plain body",
  "html": "<p>html body</p>",
  "headers": [{ "key": "subject", "value": "Hello" }],
  "attachments": [
    {
      "id": "uuid",
      "filename": "note.txt",
      "contentType": "text/plain",
      "size": 17,
      "disposition": "attachment",
      "contentId": null,
      "b2Key": "emails/.../attachments/uuid-note.txt"
    }
  ],
  "provider": { "name": "cloudflare-email-routing", "messageId": null, "rawSize": 1234 },
  "sizeBytes": 1234,
  "createdAt": "2026-10-31T12:00:01.000Z"
}
```

Attachment bytes are stored as separate B2 objects, not duplicated inside the JSON.

## Storage and trash semantics

- `size_bytes` is JSON bytes + attachment bytes; every received or sent message increases it.
- Trash is a **soft delete**: `is_trashed=1` immediately removes the message from
  `used_bytes`, but B2 objects stay until a permanent delete.
- `physical_bytes` reports what B2 actually holds (active + trash).
- Permanent group delete (`POST /api/emails/delete`) removes B2 objects and D1 rows.
- Hard-delete batches are capped at 10 ids per request to stay within Worker subrequest
  limits (list + deletes per message). Trash/restore batches allow 100.

## API

All `/api/*` routes require `x-api-key: <MAIL_API_KEY>` or `Authorization: Bearer <key>`.
`GET /health` is public.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | DB/config health |
| POST | `/api/mailboxes` | Create mailbox for a user address |
| GET | `/api/mailboxes` | List mailboxes with storage |
| GET | `/api/mailboxes/lookup?address=` | Find a user's mailbox |
| GET | `/api/mailboxes/:id` | Mailbox + storage |
| GET | `/api/mailboxes/:id/emails` | List mail of one user (`trashed`, `direction`, `q`, `since`, `limit`, `offset`) |
| POST | `/api/emails/send` | Send through Brevo (Sender.net fallback), store JSON in B2 |
| GET | `/api/emails/:id` | Metadata + full JSON from B2 |
| GET | `/api/emails/:id/content` | Raw stored JSON |
| GET | `/api/emails/:id/attachments/:attachmentId` | Attachment download |
| GET | `/api/emails/:id/b2-url?expires_in=` | Presigned B2 URL for the JSON |
| POST | `/api/emails/trash` | Group soft delete (`ids`) |
| POST | `/api/emails/restore` | Group restore (`ids`) |
| POST | `/api/emails/delete` | Group permanent delete (`ids`, or `{mailbox_id, trashed:true}`) |
| GET | `/api/storage` | Global or per-mailbox B2 usage (`mailbox_id`) |

### Send request

```json
{
  "mailbox_id": "uuid",
  "from": { "email": "verified@yourdomain.com", "name": "OnlyOrders" },
  "to": [{ "email": "customer@example.com", "name": "Customer" }],
  "cc": [],
  "bcc": [],
  "reply_to": { "email": "support@yourdomain.com" },
  "subject": "Your order",
  "html": "<p>Hello</p>",
  "text": "Hello",
  "attachments": [
    { "filename": "invoice.pdf", "content_type": "application/pdf", "content_base64": "JVBER..." }
  ],
  "tags": ["transactional"]
}
```

`mailbox_id` is optional; without it the Worker uses `mailbox_address` or the `from`
address as the owning mailbox. Brevo is active when `BREVO_API_KEY` is set, and supports
multiple `to` recipients, `cc`/`bcc`, `reply_to`, tags and base64 attachments. The
Sender.net fallback is used only when Brevo is absent or forced via `MAIL_SEND_PROVIDER`;
it supports exactly one `to` recipient, no `cc`/`bcc`, and URL attachments. Attachments
are limited by `MAX_SEND_BYTES` (default 10 MiB), max 20 files, body max 2M chars.

## Local development

```sh
cd apps/mail
bun install
# .dev.vars contains B2_* (copied from the repo root .env), MAIL_API_KEY,
# DEFAULT_FROM_*, BREVO_API_KEY and optional SENDER_API_KEY / MAILOSAUR_*.
bun run db:migrate:local
bun run dev                     # http://127.0.0.1:8787
bun run scripts/test-api.ts     # 54 end-to-end checks incl. local inbound delivery
MAIL_BASE_URL=http://127.0.0.1:8787 bun run scripts/test-provider.ts
                                 # live Brevo -> Mailosaur delivery test
```

Simulated inbound delivery uses Wrangler's local endpoint:

```sh
curl -X POST 'http://127.0.0.1:8787/cdn-cgi/local/email?from=sender@example.com&to=inbox@onlyorders.tech' \
  --data-binary @message.eml
```

## Deployment

Secure mode (recommended):

```sh
cd apps/mail
wrangler d1 create onlyorders-mail-db        # done; id is in wrangler.jsonc
wrangler d1 execute onlyorders-mail-db --remote --file=./migrations/0001_init.sql
wrangler secret put B2_KEY_ID
wrangler secret put B2_APPLICATION_KEY
wrangler secret put B2_BUCKET_NAME
wrangler secret put B2_ENDPOINT
wrangler secret put B2_REGION
wrangler secret put MAIL_API_KEY
wrangler secret put BREVO_API_KEY
# Optional fallback:
wrangler secret put SENDER_API_KEY
wrangler deploy
```

### Current plaintext variable mode

This deployment currently uses **plaintext Worker variables** configured in Cloudflare.
They are not encrypted secrets. `apps/mail/wrangler.local.json` exists only on the local
machine (chmod 600, gitignored) and is not available to Cloudflare Workers Builds.

- Local deploys: `bun run deploy:plaintext` uses `wrangler.local.json` when present.
- Cloudflare Workers Builds: the same command finds no local file and automatically falls
  back to `wrangler deploy --keep-vars`. `--keep-vars` preserves the plaintext Worker
  variables already configured in Cloudflare.
- Explicit CI command: `bun run deploy:keep-vars`.

Never use plain `wrangler deploy` (or `bun run deploy`) without `--keep-vars` in CI:
Wrangler would delete the existing dashboard variables before setting the vars in
`wrangler.jsonc`. Never commit `wrangler.local.json` or `.dev.vars`.

## CI/CD

Production deployment is handled by **Cloudflare Workers Builds** connected to the
repository.

Cloudflare Workers Builds settings:

- **Root directory:** repository root (`/`, or leave blank)
- **Build command:** `cd apps/mail && bun run preview`
- **Deploy command:** `cd apps/mail && bun run deploy:plaintext`
  (falls back to `--keep-vars` in the build environment), or explicitly
  `cd apps/mail && bun run deploy:keep-vars`

GitHub Actions (`.github/workflows/mail-worker.yml`) is **preview/CI only**:

- Pull requests and pushes to `main`: install, typecheck, dry-run build, and upload
  `apps/mail/dist` as `mail-worker-preview-<sha>`.
- It does not deploy and requires no GitHub deployment secrets.

Local commands:

```sh
cd apps/mail
bun run preview             # preview build only, no deploy
bun run deploy:plaintext    # local: wrangler.local.json; CI: --keep-vars
bun run deploy:keep-vars    # deploy committed config, preserve dashboard vars
bun run deploy              # secure encrypted-secrets deployment
```

### Brevo prerequisites

`onlyorders.tech` must be authenticated in Brevo (SPF, DKIM, DMARC) and the chosen
`from` address must belong to an active sender/authenticated domain. Check with:

```sh
curl -H "api-key: $BREVO_API_KEY" https://api.brevo.com/v3/senders
curl -H "api-key: $BREVO_API_KEY" https://api.brevo.com/v3/senders/domains
```

## Inbound routing (enabled)

Email Routing is **enabled on the apex** `onlyorders.tech`:

- Cloudflare MX: `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`,
  `route3.mx.cloudflare.net`
- Catch-all: **Send to a Worker** → `onlyorders-mail`
- SPF: `v=spf1 include:zohomail.com include:sendersrv.com include:_spf.mx.cloudflare.net ~all`
- DKIM: Cloudflare's required `cf2024-1._domainkey` record plus the existing Zoho/Brevo records
- Zoho MX has been replaced, so root-domain inbound mail now goes to the Worker, not Zoho.

The pre-cutover MX, SPF, rules and settings are stored in
`apps/mail/.rollback-snapshot.json` (gitignored). The committed recovery script is
`apps/mail/scripts/rollback-to-zoho.ts`:

```sh
# Inspect the plan only
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
  bun apps/mail/scripts/rollback-to-zoho.ts

# Restore Zoho MX + original SPF and disable Email Routing
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
  bun apps/mail/scripts/rollback-to-zoho.ts --apply
```

A sender that cached the old Zoho MX can keep delivering to the old host until its DNS
TTL expires. The end-to-end inbound test therefore used a fresh subdomain
(`mail.onlyorders.tech`) before it was removed. Root routing remains enabled and ready;
once a sender's MX cache expires, root-domain delivery reaches the Worker.

## Security notes

- B2 bucket stays private; the API never exposes credentials.
- Presigned B2 URLs are returned only to API-key holders and expire (default 1h, max 24h).
- Attachments are always served as downloads with `nosniff` to prevent active content.
- `MAIL_API_KEY` is a Worker secret and is not committed. Rotate it with
  `wrangler secret put MAIL_API_KEY`.
