import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Facebook Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
    process.env.META_REDIRECT_URI = 'http://localhost/callback';
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getFacebookOAuthUrl builds correct URL', async () => {
    const { getFacebookOAuthUrl } = await import('@repo/integrations/facebook');
    const url = getFacebookOAuthUrl('business-state-123');
    expect(url).toContain('app-id');
    expect(url).toContain('business-state-123');
    expect(url).toContain('pages_messaging');
  });

  it('exchangeCodeForToken calls Graph API', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'user-access-token' }), { status: 200 }),
    ) as typeof fetch;

    const { exchangeCodeForToken } = await import('@repo/integrations/facebook');
    const token = await exchangeCodeForToken('auth-code');
    expect(token).toBe('user-access-token');
  });

  it('sendMessage posts to Graph API', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch;

    const { sendMessage } = await import('@repo/integrations/facebook');
    await sendMessage('page-token', 'recipient-1', 'Hello');
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/me/messages');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.message.text).toBe('Hello');
  });

  it('sendMessage throws on API error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('error', { status: 400 })) as typeof fetch;
    const { sendMessage } = await import('@repo/integrations/facebook');
    await expect(sendMessage('bad-token', 'r', 'hi')).rejects.toThrow();
  });

  it('exchangeCodeForToken throws on API error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad request', { status: 400 })) as typeof fetch;
    const { exchangeCodeForToken } = await import('@repo/integrations/facebook');
    await expect(exchangeCodeForToken('bad-code')).rejects.toThrow('Facebook token exchange failed');
  });

  it('getUserPages throws on API error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    const { getUserPages } = await import('@repo/integrations/facebook');
    await expect(getUserPages('bad-token')).rejects.toThrow('Failed to fetch pages');
  });

  it('verifyWebhookSignature returns false without signature or secret', async () => {
    delete process.env.META_APP_SECRET;
    const { verifyWebhookSignature } = await import('@repo/integrations/facebook');
    expect(verifyWebhookSignature('payload', undefined)).toBe(false);
    expect(verifyWebhookSignature('payload', 'sha256=abc')).toBe(false);
  });

  it('verifyWebhookSignature returns true when signature and secret exist', async () => {
    process.env.META_APP_SECRET = 'secret';
    const { verifyWebhookSignature } = await import('@repo/integrations/facebook');
    expect(verifyWebhookSignature('payload', 'sha256=abc')).toBe(true);
  });

  it('getUserPages returns page list', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'p1', name: 'Page', access_token: 'tok' }] }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const { getUserPages } = await import('@repo/integrations/facebook');
    const pages = await getUserPages('user-token');
    expect(pages[0].id).toBe('p1');
  });
});
