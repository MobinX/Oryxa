import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { createMessage } from '@repo/db/crud/conversation';
import { listMessages } from '@repo/db/crud/conversation';

const triggerAgentRunMock = vi.fn();
vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: (...args: unknown[]) => triggerAgentRunMock(...args),
  runAgentForConversation: vi.fn(),
}));

describe('Facebook Webhook', () => {
  withPglite();
  beforeEach(() => triggerAgentRunMock.mockClear());

  it('rejects non-page payloads', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'user', entry: [] }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Unhandled or malformed webhook');
  });

  it('verifies hub.challenge', async () => {
    const res = await fbWebhookRouter.request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=abc123',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('rejects subscribe without challenge value', async () => {
    const res = await fbWebhookRouter.request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=test-token',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('rejects malformed JSON body', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid verify token', async () => {
    const res = await fbWebhookRouter.request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc',
    );
    expect(res.status).toBe(403);
  });

  it('acknowledges webhook without messaging text', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'page', entry: [{ id: 'PAGE', messaging: [{}] }] }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('saves message and triggers agent when channel has agent', async () => {
    const seed = await seedTestWorld();
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [
          {
            id: seed.pageChannelId,
            messaging: [
              {
                sender: { id: 'NEW_SENDER' },
                message: { text: 'Do you have t-shirts?' },
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).toHaveBeenCalledTimes(1);
  });

  it('does not trigger agent when conversation is already working', async () => {
    const seed = await seedTestWorld();
    await createMessage({
      conversationId: seed.conversation.id,
      from: 'customer',
      content: 'First',
      state: 'pending',
    });
    // Force working state
    const { updateConversationState } = await import('@repo/db/crud/conversation');
    await updateConversationState(seed.conversation.id, 'working');

    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [
          {
            id: seed.pageChannelId,
            messaging: [
              {
                sender: { id: seed.conversation.customerPlatformId },
                message: { text: 'Another message while working' },
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('ignores unknown page id gracefully', async () => {
    const res = await fbWebhookRouter.request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [
          {
            id: 'UNKNOWN_PAGE',
            messaging: [{ sender: { id: 'X' }, message: { text: 'Hi' } }],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });
});
