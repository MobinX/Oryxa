import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fbWebhookRouter } from '@api/webhooks/facebook';

vi.mock('@repo/db/crud/channel', () => ({
  getChannelByPageId: vi.fn(),
}));

vi.mock('@repo/db/crud/conversation', () => ({
  processInboundMessage: vi.fn(),
}));

vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: vi.fn(),
}));

import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { triggerAgentRun } from '@api/lib/agent-runner';

describe('Facebook Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ignore non-page payloads', async () => {
    const req = new Request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'user', entry: [] }),
    });

    const res = await fbWebhookRouter.request(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Unhandled or malformed webhook');
  });

  it('should verify webhook challenge', async () => {
    process.env.META_VERIFY_TOKEN = 'test-token';
    const req = new Request(
      'http://localhost/facebook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=challenge123',
    );
    const res = await fbWebhookRouter.request(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('challenge123');
  });

  it('should process valid text message, save to db, and trigger background agent runner', async () => {
    vi.mocked(getChannelByPageId).mockResolvedValueOnce({
      id: 'channel-id-123',
      businessId: 'business-id-123',
      agentId: 'agent-123',
    } as never);

    vi.mocked(processInboundMessage).mockResolvedValueOnce({
      conversationId: 'conv-id-456',
      priorStatus: 'done',
    });

    const metaPayload = {
      object: 'page',
      entry: [
        {
          id: 'PAGE_ID',
          messaging: [
            {
              sender: { id: 'CUSTOMER_ID' },
              message: { text: 'I need details on your automated messenger agents.' },
            },
          ],
        },
      ],
    };

    const req = new Request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload),
    });

    const res = await fbWebhookRouter.request(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');
    expect(triggerAgentRun).toHaveBeenCalledTimes(1);
    expect(triggerAgentRun).toHaveBeenCalledWith('conv-id-456');
  });
});
