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

vi.mock('@api/lib/comment-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@api/lib/comment-runner')>();
  return {
    ...actual,
    runAgentForCommentThread: vi.fn(async () => undefined),
  };
});

import { runAgentForConversation } from '@api/lib/agent-runner';
import { runAgentForCommentThread } from '@api/lib/comment-runner';

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

  it('rejects every internal request when INTERNAL_KEY is unset', async () => {
    const configured = process.env.INTERNAL_KEY;
    delete process.env.INTERNAL_KEY;
    try {
      const bare = await app.request('/internal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: '00000000-0000-0000-0000-000000000000' }),
      });
      expect(bare.status).toBe(401);

      const keyed = await app.request('/internal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': configured ?? 'test-internal-key' },
        body: JSON.stringify({ conversationId: '00000000-0000-0000-0000-000000000000' }),
      });
      expect(keyed.status).toBe(401);
    } finally {
      process.env.INTERNAL_KEY = configured;
    }
  });

  it('rejects an INTERNAL_KEY shorter than 16 characters', async () => {
    const configured = process.env.INTERNAL_KEY;
    process.env.INTERNAL_KEY = 'too-short';
    try {
      const res = await app.request('/internal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': 'too-short' },
        body: JSON.stringify({ conversationId: '00000000-0000-0000-0000-000000000000' }),
      });
      expect(res.status).toBe(401);
    } finally {
      process.env.INTERNAL_KEY = configured;
    }
  });

  it('GET /internal/audio-check returns only a boolean and no filesystem paths', async () => {
    const res = await app.request('/internal/audio-check', {
      headers: { 'x-internal-key': 'test-internal-key' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: unknown };
    expect(Object.keys(body)).toEqual(['ok']);
    expect(typeof body.ok).toBe('boolean');
    expect(JSON.stringify(body)).not.toContain(process.cwd());
  });

  it('rate limits playground runs per IP', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'x-internal-key': 'test-internal-key',
      'x-forwarded-for': '203.0.113.77',
    };
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      const res = await app.request('/internal/test-run', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
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

  it('POST /internal/run-comment returns 401 without key', async () => {
    const res = await app.request('/internal/run-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentThreadId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /internal/run-comment returns 400 for invalid payload', async () => {
    const res = await app.request('/internal/run-comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': 'test-internal-key',
      },
      body: JSON.stringify({ bad: 'data' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /internal/run-comment accepts a comment thread and returns 202', async () => {
    const { getOrCreateCommentThread } = await import('@repo/db/crud/comment');
    const seed = await seedTestWorld();
    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_R',
      'COMMENTER_R',
      'R',
    );
    const res = await app.request('/internal/run-comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': 'test-internal-key',
      },
      body: JSON.stringify({ commentThreadId: thread.id }),
    });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 100));
    expect(runAgentForCommentThread).toHaveBeenCalledWith(thread.id);
  });
});
