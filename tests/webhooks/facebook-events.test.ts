import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { webhookHeaders } from '../helpers/meta-sign';
import { flushBackground } from '@api/lib/background';
import { app } from '@api/app';
import { flush, __testOnly } from '@api/lib/log';

process.env.META_APP_SECRET = 'test-app-secret';

const triggerAgentRunMock = vi.fn();
vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: (...args: unknown[]) => triggerAgentRunMock(...args),
  runAgentForConversation: vi.fn(),
}));

vi.mock('@repo/integrations/facebook', () => ({
  verifyWebhookSignature: vi.fn(async (payload: string, signature?: string) => {
    if (!signature) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(process.env.META_APP_SECRET || 'test-app-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const bytes = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    const received = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
    return received.toLowerCase() === `sha256=${hex}`.toLowerCase();
  }),
  getFacebookUserProfile: vi.fn(async () => ({ name: 'FB Sender', avatar: 'https://fb/img.png' })),
  getFacebookPostContext: vi.fn(async () => null),
  replyToFacebookComment: vi.fn(async () => 'MOCK_REPLY_ID'),
  publishFacebookPost: vi.fn(async () => 'MOCK_POST_ID'),
  sendMessage: vi.fn(async () => undefined),
  senderAction: vi.fn(async () => undefined),
}));

type Event = Record<string, unknown>;

let batches: Event[][] = [];

const events = () => batches.flat();
const of = (evt: string) => events().filter((e) => e.evt === evt);

/** One delivery = one invocation: ack, drain the background work, settle the queue. */
async function deliver(payload: unknown, signature = true): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) Object.assign(headers, await webhookHeaders(body));
  const res = await app.request('http://localhost/webhooks/facebook', { method: 'POST', headers, body });
  await flushBackground();
  await flush();
  return res;
}

const entry = (pageId: string, messaging: unknown[]) => ({ id: pageId, messaging });
const text = (senderId: string, content: string, mid: string) => ({
  sender: { id: senderId },
  message: { text: content, mid },
});

describe('one webhook delivery states each fact once', () => {
  withPglite();

  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('axiom');
    batches = [];
    __testOnly.setIngest((next) => {
      batches.push([...next]);
      return Promise.resolve();
    });
    triggerAgentRunMock.mockClear();
    process.env.META_APP_SECRET = 'test-app-secret';
    process.env.META_VERIFY_TOKEN = 'test-token';
  });

  afterEach(() => {
    __testOnly.reset();
  });

  it('carries the delivery, the item it acted on, and the request that acked it', async () => {
    const seed = await seedTestWorld();

    const res = await deliver({
      object: 'page',
      entry: [entry(seed.pageChannelId, [text('SENDER_1', 'Do you have t-shirts?', 'mid-1')])],
    });

    expect(res.status).toBe(200);
    expect(await res.clone().text()).toBe('EVENT_RECEIVED');

    // ≤3 events for the whole delivery, in one ingest request per flush.
    expect(events().length).toBeLessThanOrEqual(3);
    expect(of('req')).toHaveLength(1);
    expect(of('webhook')).toHaveLength(1);
    expect(of('webhook_item')).toHaveLength(1);

    expect(of('webhook')[0]).toMatchObject({
      event: 'delivery',
      object: 'page',
      signatureValid: true,
      pageId: seed.pageChannelId,
      entryCount: 1,
      messagingCount: 1,
      changesCount: 0,
    });
    expect(of('webhook_item')[0]).toMatchObject({
      kind: 'message',
      externalId: 'mid-1',
      inserted: true,
      outcome: 'agent_triggered',
    });
    // channelId/businessId are stamped once on the context, not repeated per field.
    expect(of('webhook_item')[0].channelId).toBe(seed.channel.id);
    expect(of('webhook')[0].channelId).toBeUndefined();
  });

  it('never carries the customer text, the sender id or the signature', async () => {
    const seed = await seedTestWorld();
    const body = JSON.stringify({
      object: 'page',
      entry: [entry(seed.pageChannelId, [text('PSID_SECRET_1', 'my card number is 4242', 'mid-secret')])],
    });

    await app.request('http://localhost/webhooks/facebook', {
      method: 'POST',
      headers: await webhookHeaders(body),
      body,
    });
    await flushBackground();
    await flush();

    const wire = JSON.stringify(events());
    for (const leaked of ['my card number is 4242', 'PSID_SECRET_1', 'sha256=', 'x-hub-signature']) {
      expect(wire).not.toContain(leaked);
    }
    // The id that is a fact about the delivery is the message id, and it is kept.
    expect(wire).toContain('mid-secret');
  });

  it('records the verify handshake without the verify token', async () => {
    process.env.META_VERIFY_TOKEN = 'VERIFY_SENTINEL_9f31';
    const res = await app.request(
      'http://localhost/webhooks/facebook?hub.mode=subscribe&hub.verify_token=VERIFY_SENTINEL_9f31&hub.challenge=12345',
    );

    expect(res.status).toBe(200);
    expect(await res.clone().text()).toBe('12345');

    const verify = of('webhook');
    expect(verify).toHaveLength(1);
    expect(verify[0]).toMatchObject({ event: 'verify', mode: 'subscribe', verified: true, hasChallenge: true });
    const wire = JSON.stringify(events());
    // The middleware logs the path, never the query that carries the token.
    expect(wire).not.toContain('VERIFY_SENTINEL_9f31');
    expect(wire).not.toContain('hub.verify_token');
  });

  it('shows a rejected handshake, which is how a page goes quiet forever', async () => {
    const res = await app.request(
      'http://localhost/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong-one&hub.challenge=12345',
    );
    expect(res.status).toBe(403);
    expect(of('webhook')).toMatchObject([{ event: 'verify', verified: false }]);
  });

  it('marks a forged delivery as accepted-but-invalid instead of hiding it', async () => {
    const seed = await seedTestWorld();
    const body = JSON.stringify({
      object: 'page',
      entry: [entry(seed.pageChannelId, [text('FORGED_SENDER', 'hi', 'mid-forge')])],
    });
    const res = await app.request('http://localhost/webhooks/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      body,
    });
    await flushBackground();
    await flush();

    // Behaviour unchanged: still acknowledged. Visibility is the change.
    expect(res.status).toBe(200);
    expect(of('webhook')[0]).toMatchObject({ signatureValid: false });
  });

  it('names an unknown page as the reason nothing was stored', async () => {
    const res = await deliver({
      object: 'page',
      entry: [entry('PAGE_WITH_NO_CHANNEL', [text('X', 'hi', 'mid-x')])],
    });

    expect(res.status).toBe(200);
    expect(of('webhook_item')).toHaveLength(0);
    expect(of('anomaly')).toMatchObject([{ kind: 'webhook_unknown_page', detail: 'PAGE_WITH_NO_CHANNEL' }]);
  });

  it('says which item reached nobody because the channel has no agent', async () => {
    const seed = await seedTestWorld();
    const { updateChannelAgent } = await import('@repo/db/crud/channel');
    await updateChannelAgent(seed.channel.id, seed.business.id, null);

    await deliver({
      object: 'page',
      entry: [entry(seed.pageChannelId, [text('NO_AGENT_SENDER', 'hello?', 'mid-na')])],
    });

    expect(of('webhook_item')[0]).toMatchObject({ outcome: 'no_agent', inserted: true });
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('counts a redelivered message id, so idempotency is visible', async () => {
    const seed = await seedTestWorld();
    const event = text('DEDUPE_SENDER', 'same message twice', 'mid-dup');

    await deliver({ object: 'page', entry: [entry(seed.pageChannelId, [event, event])] });

    const items = of('webhook_item');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ externalId: 'mid-dup', inserted: true, outcome: 'agent_triggered' });
    expect(items[1]).toMatchObject({ externalId: 'mid-dup', inserted: false, outcome: 'redelivered' });
    expect(triggerAgentRunMock).toHaveBeenCalledTimes(1);
  });

  it('gives an attachment-only message an outcome instead of silence', async () => {
    const seed = await seedTestWorld();

    await deliver({
      object: 'page',
      entry: [entry(seed.pageChannelId, [{ sender: { id: 'ATTACH_SENDER' }, message: { mid: 'mid-attach', attachments: [] } }])],
    });

    // Not actionable today, but a customer did send something and got nothing.
    expect(of('webhook_item')).toMatchObject([{ kind: 'message', externalId: 'mid-attach', outcome: 'unsupported_content' }]);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('reports the age it found on a live runner, which tunes the stale threshold', async () => {
    const seed = await seedTestWorld();
    const { createMessage, updateConversationState } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'first', state: 'pending' });
    await updateConversationState(seed.conversation.id, 'working');

    await deliver({
      object: 'page',
      entry: [entry(seed.pageChannelId, [text(seed.conversation.customerPlatformId, 'second', 'mid-live')])],
    });

    expect(of('webhook_item')[0]).toMatchObject({ priorStatus: 'working', outcome: 'waited_for_live_runner' });
    expect(typeof of('webhook_item')[0].ageMs).toBe('number');
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('still acks a malformed body with one delivery event', async () => {
    const body = 'not-json';
    const res = await app.request('http://localhost/webhooks/facebook', {
      method: 'POST',
      headers: await webhookHeaders(body),
      body,
    });
    await flushBackground();
    await flush();

    expect(res.status).toBe(400);
    expect(of('webhook')).toMatchObject([{ event: 'delivery', signatureValid: true }]);
    expect(of('webhook_item')).toHaveLength(0);
  });
});
