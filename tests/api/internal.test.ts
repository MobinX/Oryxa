import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { app } from '@api/app';

vi.mock('@api/lib/agent-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@api/lib/agent-runner')>();
  return {
    ...actual,
    runAgentForConversation: vi.fn(async () => undefined),
  };
});

import { runAgentForConversation } from '@api/lib/agent-runner';

describe('Internal Agent Runner API', () => {
  withPglite();

  it('POST /internal/run returns 401 without key', async () => {
    const res = await app.request('/internal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /internal/run returns 400 for invalid payload', async () => {
    const res = await app.request('/internal/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': 'test-internal-key',
      },
      body: JSON.stringify({ bad: 'data' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /internal/run accepts valid conversation and returns 202', async () => {
    const { conversation } = await seedTestWorld();
    const res = await app.request('/internal/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': 'test-internal-key',
      },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(res.status).toBe(202);
    // Allow async agent run to settle
    await new Promise((r) => setTimeout(r, 100));
    expect(runAgentForConversation).toHaveBeenCalled();
  });
});
