import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signMetaWebhook } from '../helpers/meta-sign';

describe('Facebook Integration', () => {
  const originalFetch = globalThis.fetch;
  const originalAppSecret = process.env.META_APP_SECRET;

  beforeEach(() => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
    process.env.META_REDIRECT_URI = 'http://localhost/callback';
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.META_APP_SECRET = originalAppSecret;
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
    expect(await verifyWebhookSignature('payload', undefined)).toBe(false);
    expect(await verifyWebhookSignature('payload', 'sha256=abc')).toBe(false);
  });

  it('verifyWebhookSignature accepts a valid HMAC and rejects a bad one', async () => {
    process.env.META_APP_SECRET = 'secret';
    const { verifyWebhookSignature } = await import('@repo/integrations/facebook');
    const good = await signMetaWebhook('payload');
    expect(await verifyWebhookSignature('payload', good)).toBe(true);
    expect(await verifyWebhookSignature('payload', 'sha256=deadbeef')).toBe(false);
    // Signature over a different body must not validate.
    expect(await verifyWebhookSignature('tampered', good)).toBe(false);
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

  it('subscribeFacebookPageToWebhooks posts subscribed_fields to Graph API', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as typeof fetch;

    const { subscribeFacebookPageToWebhooks, FACEBOOK_PAGE_WEBHOOK_FIELDS } =
      await import('@repo/integrations/facebook');
    await subscribeFacebookPageToWebhooks('page-123', 'page-token');

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/page-123/subscribed_apps');
    expect(call[0]).toContain('messages');
    expect(call[0]).toContain('messaging_postbacks');
    expect(call[0]).toContain('feed');
    expect(FACEBOOK_PAGE_WEBHOOK_FIELDS).toContain('messaging_postbacks');
    expect((call[1] as RequestInit).method).toBe('POST');
  });

  it('subscribeFacebookPageToWebhooks throws on API error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    const { subscribeFacebookPageToWebhooks } = await import('@repo/integrations/facebook');
    await expect(subscribeFacebookPageToWebhooks('page-123', 'bad-token')).rejects.toThrow(
      'Facebook page webhook subscription failed',
    );
  });
});
