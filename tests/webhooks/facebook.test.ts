import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { createMessage, listMessages, listConversations } from '@repo/db/crud/conversation';
import { webhookHeaders } from '../helpers/meta-sign';
import { flushBackground } from '@api/lib/background';

// The webhook handler verifies signatures with META_APP_SECRET; pin it here so
// the tests don't depend on global env ordering or leaks from other suites.
process.env.META_APP_SECRET = 'test-app-secret';

const triggerAgentRunMock = vi.fn();
vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: (...args: unknown[]) => triggerAgentRunMock(...args),
  runAgentForConversation: vi.fn(),
}));

async function postWebhook(payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await fbWebhookRouter.request('http://localhost/facebook', {
    method: 'POST',
    headers: await webhookHeaders(body),
    body,
  });
  // The webhook acks immediately and processes entries in the background; flush
  // so assertions on side effects are deterministic.
  await flushBackground();
  return res;
}

const pageEntry = (pageId: string, events: unknown[]) => ({
  id: pageId,
  messaging: events,
});

const textEvent = (senderId: string, text: string, mid?: string) => ({
  sender: { id: senderId },
  message: mid ? { text, mid } : { text },
});

describe('Facebook Webhook', () => {
  withPglite();
  beforeEach(() => {
    process.env.META_APP_SECRET = 'test-app-secret';
    triggerAgentRunMock.mockClear();
  });

  it('verifies hub.challenge', async () => {
    const res = await fbWebhookRouter.request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=abc123',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('rejects subscribe with wrong verify token', async () => {
    const res = await fbWebhookRouter.request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc',
    );
    expect(res.status).toBe(403);
  });

  it('rejects POST with a missing signature', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'page', entry: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects POST with an invalid signature', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      body: JSON.stringify({ object: 'page', entry: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-page payloads', async () => {
    const res = await postWebhook({ object: 'user', entry: [] });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON body (with valid signature over the raw body)', async () => {
    const body = 'not-json';
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: await webhookHeaders(body),
      body,
    });
    expect(res.status).toBe(400);
  });

  it('acknowledges a webhook with no messaging text', async () => {
    const res = await postWebhook({
      object: 'page',
      entry: [pageEntry('PAGE', [{}])],
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('saves a message and triggers the agent when the channel has one', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [pageEntry(seed.pageChannelId, [textEvent('NEW_SENDER', 'Do you have t-shirts?', 'mid-1')])],
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).toHaveBeenCalledTimes(1);
  });

  it('does not trigger the agent when the conversation is already working', async () => {
    const seed = await seedTestWorld();
    await createMessage({
      conversationId: seed.conversation.id,
      from: 'customer',
      content: 'First',
      state: 'pending',
    });
    const { updateConversationState } = await import('@repo/db/crud/conversation');
    await updateConversationState(seed.conversation.id, 'working');

    const res = await postWebhook({
      object: 'page',
      entry: [
        pageEntry(seed.pageChannelId, [
          textEvent(seed.conversation.customerPlatformId, 'Another message while working', 'mid-2'),
        ]),
      ],
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('ignores an unknown page id gracefully', async () => {
    const res = await postWebhook({
      object: 'page',
      entry: [pageEntry('UNKNOWN_PAGE', [textEvent('X', 'Hi', 'mid-3')])],
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('filters echo messages (bot replies) so they are not re-ingested as inbound', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [
        pageEntry(seed.pageChannelId, [
          { sender: { id: seed.pageChannelId }, message: { text: 'Bot reply', is_echo: true, mid: 'echo-1' } },
        ]),
      ],
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
    const msgs = await listMessages(seed.conversation.id, seed.business.id);
    // No customer message was created from the echo.
    expect(msgs?.every((m) => m.content !== 'Bot reply')).toBe(true);
  });

  it('processes every entry and every messaging event in a batched payload', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [
        pageEntry(seed.pageChannelId, [
          textEvent('BATCH_A', 'first', 'b-1'),
          textEvent('BATCH_A', 'second', 'b-2'),
        ]),
        pageEntry('UNKNOWN_PAGE', [textEvent('BATCH_B', 'ignored', 'b-3')]),
      ],
    });
    expect(res.status).toBe(200);
    // Both messages from BATCH_A were saved; only the first triggers (the
    // second arrives while the conversation is now 'pending').
    expect(triggerAgentRunMock).toHaveBeenCalledTimes(1);
  });

  it('is idempotent under webhook retries (same mid is not stored twice)', async () => {
    const seed = await seedTestWorld();
    const payload = {
      object: 'page',
      entry: [pageEntry(seed.pageChannelId, [textEvent('RETRY', 'hello', 'mid-dup')])],
    };
    const first = await postWebhook(payload);
    const second = await postWebhook(payload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Only one agent trigger despite the retry; the duplicate insert was ignored.
    expect(triggerAgentRunMock).toHaveBeenCalledTimes(1);

    // The RETRY conversation is separate from the seeded one; find it by sender.
    const convs = await listConversations(seed.business.id);
    const retryConv = convs.find((c) => c.customerPlatformId === 'RETRY');
    expect(retryConv).toBeDefined();
    const msgs = await listMessages(retryConv!.id, seed.business.id);
    const customerMsgs = msgs?.filter((m) => m.content === 'hello') ?? [];
    expect(customerMsgs.length).toBe(1);
  });
});
