import { describe, it, expect, vi } from 'vitest';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

const mockInvoke = vi.fn(async () => ({
  content: 'Thanks for asking — here is what I know.',
  usage_metadata: { input_tokens: 60, output_tokens: 15, total_tokens: 75 },
}));
ChatGoogleGenerativeAI.prototype.invoke = mockInvoke as any;
ChatOpenAI.prototype.invoke = mockInvoke as any;

import { eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { db } from '@db/client';
import { assistantUsage, businesses, llmTokenLogs } from '@db/schema';

const tomorrowUtc = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function publicBody(message = 'How much is the Pro plan?') {
  return JSON.stringify({ message, history: [], lang: 'en', brand: 'TestCo' });
}

function publicHeaders(ip: string) {
  return { 'Content-Type': 'application/json', 'x-forwarded-for': ip };
}

describe('Site assistant chat', () => {
  withPglite();

  it('answers a visitor and reports the budget left today', async () => {
    mockInvoke.mockClear();
    const res = await app.request('/api/v1/chat/public', {
      method: 'POST',
      headers: publicHeaders('10.9.0.1'),
      body: publicBody(),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(typeof data.reply).toBe('string');
    expect(data.reply.length).toBeGreaterThan(0);
    expect(data.remaining).toBe(9);
    expect(data.resetsAt).toBe(tomorrowUtc());
    // Guards the prototype patch: a live call would still 200, so prove the mock ran.
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('caps an IP at the daily limit', async () => {
    const prev = process.env.CHAT_PUBLIC_DAILY_LIMIT;
    process.env.CHAT_PUBLIC_DAILY_LIMIT = '2';
    try {
      const ip = '10.9.0.2';
      for (let i = 0; i < 2; i++) {
        const res = await app.request('/api/v1/chat/public', {
          method: 'POST',
          headers: publicHeaders(ip),
          body: publicBody('Is there a free plan?'),
        });
        expect(res.status).toBe(200);
      }
      const denied = await app.request('/api/v1/chat/public', {
        method: 'POST',
        headers: publicHeaders(ip),
        body: publicBody('And what else?'),
      });
      expect(denied.status).toBe(429);
      const data = (await denied.json()) as any;
      expect(typeof data.error).toBe('string');
    } finally {
      if (prev === undefined) delete process.env.CHAT_PUBLIC_DAILY_LIMIT;
      else process.env.CHAT_PUBLIC_DAILY_LIMIT = prev;
    }
  });

  it('refuses an over-long visitor message', async () => {
    const res = await app.request('/api/v1/chat/public', {
      method: 'POST',
      headers: publicHeaders('10.9.0.3'),
      body: publicBody('x'.repeat(501)),
    });
    expect(res.status).toBe(400);
  });

  it('answers 503 when no model key is configured', async () => {
    const saved = {
      openai: process.env.OPENAI_API_KEY,
      azure: process.env.AZURE_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await app.request('/api/v1/chat/public', {
        method: 'POST',
        headers: publicHeaders('10.9.0.4'),
        body: publicBody(),
      });
      expect(res.status).toBe(503);
    } finally {
      if (saved.openai !== undefined) process.env.OPENAI_API_KEY = saved.openai;
      if (saved.azure !== undefined) process.env.AZURE_API_KEY = saved.azure;
      if (saved.gemini !== undefined) process.env.GEMINI_API_KEY = saved.gemini;
    }
  });

  it('reports quota for a business on the seeded free plan', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(`/api/v1/${seed.business.id}/assistant/quota`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.businessId).toBe(seed.business.id);
    // Free plan: 20 assistant chats per 30 days (migration 0057 backfill).
    expect(data.quota.assistantLimit).toBe(20);
    expect(data.quota.used).toBe(0);
    expect(data.quota.blocked).toBe(false);
  });

  it('spends the override budget then refuses, and logs the model call', async () => {
    const seed = await seedTestWorld();
    await db
      .update(businesses)
      .set({ assistantLimitOverride: 1 })
      .where(eq(businesses.id, seed.business.id));

    mockInvoke.mockClear();
    const first = await app.request(`/api/v1/${seed.business.id}/assistant/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: 'What plan am I on?', history: [], lang: 'en', brand: 'TestCo' }),
    });
    expect(first.status).toBe(200);
    const firstData = (await first.json()) as any;
    expect(typeof firstData.reply).toBe('string');
    expect(firstData.remaining).toBe(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    const second = await app.request(`/api/v1/${seed.business.id}/assistant/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: 'And now?', history: [], lang: 'en', brand: 'TestCo' }),
    });
    expect(second.status).toBe(429);
    // The refused turn bought nothing, so the mock still ran exactly once.
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    const quota = await app.request(`/api/v1/${seed.business.id}/assistant/quota`, {
      headers: authHeaders(),
    });
    const quotaData = (await quota.json()) as any;
    expect(quotaData.quota.used).toBe(1);
    expect(quotaData.quota.blocked).toBe(true);

    const usage = await db.select().from(assistantUsage).where(eq(assistantUsage.businessId, seed.business.id));
    expect(usage).toHaveLength(1);
    expect(usage[0].used).toBe(1);

    const logs = await db.select().from(llmTokenLogs).where(eq(llmTokenLogs.businessId, seed.business.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].integrationType).toBe('assistant_chat');
  });

  it('requires a valid bearer on the assistant doors', async () => {
    const seed = await seedTestWorld();

    const anonChat = await app.request(`/api/v1/${seed.business.id}/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello?', history: [], lang: 'en', brand: 'TestCo' }),
    });
    expect(anonChat.status).toBe(401);

    const badChat = await app.request(`/api/v1/${seed.business.id}/assistant/chat`, {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello?', history: [], lang: 'en', brand: 'TestCo' }),
    });
    // Same loose contract as the other suites: without Firebase keys the auth
    // provider itself is unavailable, which is also a 503 (see businesses.test.ts).
    expect([401, 503]).toContain(badChat.status);

    const anonQuota = await app.request(`/api/v1/${seed.business.id}/assistant/quota`);
    expect(anonQuota.status).toBe(401);
  });
});
