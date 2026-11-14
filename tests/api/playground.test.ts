import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

vi.mock('@api/lib/agent-runner-core', () => ({
  runAgentCore: vi.fn().mockResolvedValue({
    replyText: 'Hello from mock agent core',
    messages: [
      { role: 'user', content: 'Hi' },
      { role: 'ai', content: 'Hello from mock agent core', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 } },
    ],
  }),
}));

vi.mock('@api/lib/comment-test-runner', () => ({
  runCommentTest: vi.fn().mockImplementation(async (input, emitSse) => {
    emitSse('comment_replied', { text: 'Public reply from test agent' });
  }),
}));

describe('Playground API', () => {
  withPglite();

  it('rejects test-run without business access', async () => {
    const res = await app.request('/api/v1/00000000-0000-0000-0000-000000000000/playground/test-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('validates test-run input payload', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/playground/test-run`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('executes test-run and streams SSE events', async () => {
    const { business, channel } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/playground/test-run`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: channel.id,
        userMessage: 'Is this available in size L?',
        testUserId: 'test-user-123',
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: conversation_ready');
    expect(text).toContain('event: trace');
    expect(text).toContain('event: done');
  });

  it('executes comment-test-run and streams SSE events', async () => {
    const { business, channel } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/playground/comment-test-run`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: channel.id,
        comment: 'Price please?',
        commenterName: 'Test Buyer',
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: comment_replied');
    expect(text).toContain('event: done');
  });

  it('executes playground chat using full merchant agent with tool calling', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/playground/chat`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What categories do you have in stock?',
        persona: 'Oliver Queen',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toBeDefined();
    expect(typeof data.reply).toBe('string');
    expect(data.conversationId).toBeDefined();
  });
});
