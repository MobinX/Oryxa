import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/app';
import {
  createFacebookPagesSelectionToken,
  getFacebookOAuthUrl,
  getPageIdForToken,
  replyToFacebookComment,
  sendMediaMessage,
  sendMessage,
  senderAction,
  subscribeFacebookPageToWebhooks,
} from '@repo/integrations/facebook';
import {
  getExternalServiceChannel,
  upsertExternalServiceChannel,
} from '@repo/db/crud/external-service';

vi.mock('@repo/integrations/facebook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/integrations/facebook')>();
  return {
    ...actual,
    getFacebookOAuthUrl: vi.fn(
      (state: string) => `https://facebook.com/oauth?state=${encodeURIComponent(state)}`,
    ),
    exchangeCodeForToken: vi.fn(async () => 'user-token'),
    exchangeForLongLivedToken: vi.fn(async () => 'long-lived-token'),
    getUserPages: vi.fn(async () => [
      { id: 'PAGE_1', name: 'Page One', access_token: 'page-token-1' },
    ]),
    getPortfolioPages: vi.fn(async () => []),
    getPageIdForToken: vi.fn(async (token: string) => {
      if (token === 'page-token-1') return 'PAGE_1';
      if (token === 'page-token-direct') return 'PAGE_DIRECT';
      return null;
    }),
    subscribeFacebookPageToWebhooks: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => undefined),
    sendMediaMessage: vi.fn(async () => undefined),
    senderAction: vi.fn(async () => undefined),
    replyToFacebookComment: vi.fn(async () => 'REPLY_1'),
  };
});

const JSON_HEADERS = { 'content-type': 'application/json' };

async function createService(
  name = 'Acme Integration',
  uniqueName = `acme-${crypto.randomUUID()}`,
) {
  const res = await app.request('/api2/ext-service/create', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, uniqueName }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    name: string;
    uniqueName: string;
    createdAt: string;
    updatedAt: string;
  };
}

describe('External service API', () => {
  withPglite();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, reads, updates and soft-deletes a service', async () => {
    const service = await createService('Acme', 'acme-crud');

    const read = await app.request(`/api2/ext-service/${service.id}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { uniqueName: string }).uniqueName).toBe('acme-crud');

    const updated = await app.request(`/api2/ext-service/${service.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Acme Renamed' }),
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { name: string }).name).toBe('Acme Renamed');

    const removed = await app.request(`/api2/ext-service/${service.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect((await removed.json()) as { deleted: boolean }).toEqual({ deleted: true });

    const gone = await app.request(`/api2/ext-service/${service.id}`);
    expect(gone.status).toBe(404);
  });

  it('refuses a duplicate unique name', async () => {
    await createService('Dup', 'dup-name');
    const res = await app.request('/api2/ext-service/create', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Dup Again', uniqueName: 'dup-name' }),
    });
    expect(res.status).toBe(409);
  });

  it('searches by id and unique name', async () => {
    const service = await createService('Searchable', 'searchable-one');

    const byId = await app.request(`/api2/ext-service/search?id=${service.id}`);
    expect(byId.status).toBe(200);
    const idBody = (await byId.json()) as { items: Array<{ id: string }> };
    expect(idBody.items).toHaveLength(1);
    expect(idBody.items[0].id).toBe(service.id);

    const byName = await app.request('/api2/ext-service/search?uname=searchable-one');
    expect(byName.status).toBe(200);
    const nameBody = (await byName.json()) as { items: Array<{ id: string }> };
    expect(nameBody.items).toHaveLength(1);
    expect(nameBody.items[0].id).toBe(service.id);

    const neither = await app.request('/api2/ext-service/search');
    expect(neither.status).toBe(400);
  });

  it('lists services with pagination', async () => {
    await createService('Page A', `page-a-${crypto.randomUUID()}`);
    await createService('Page B', `page-b-${crypto.randomUUID()}`);
    await createService('Page C', `page-c-${crypto.randomUUID()}`);

    const res = await app.request('/api2/ext-service/all?page=1&limit=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; page: number; limit: number; total: number };
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(3);
  });

  it('creates, reads, updates and soft-deletes a webhook', async () => {
    const service = await createService('Hooks', `hooks-${crypto.randomUUID()}`);

    const created = await app.request(`/api2/ext-service/${service.id}/webhook`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url: 'https://hooks.example.com/a' }),
    });
    expect(created.status).toBe(201);
    const hook = (await created.json()) as { id: string; url: string };
    expect(hook.url).toBe('https://hooks.example.com/a');

    const read = await app.request(`/api2/ext-service/${service.id}/webhook/${hook.id}`);
    expect(read.status).toBe(200);

    const updated = await app.request(`/api2/ext-service/${service.id}/webhook/${hook.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url: 'https://hooks.example.com/b' }),
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { url: string }).url).toBe('https://hooks.example.com/b');

    const removed = await app.request(`/api2/ext-service/${service.id}/webhook/${hook.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);

    const gone = await app.request(`/api2/ext-service/${service.id}/webhook/${hook.id}`);
    expect(gone.status).toBe(404);
  });

  it('runs the full Facebook OAuth → internal redirect → connectChannel flow', async () => {
    const service = await createService('OAuth Flow', `oauth-${crypto.randomUUID()}`);
    const externalUrl = 'https://external.example.com/facebook/hook';

    const start = await app.request('/api2/ext-service/getFacebookConnectOauthUrl', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ redirectUrl: externalUrl }),
    });
    expect(start.status).toBe(200);
    const started = (await start.json()) as { url: string; businessId: string };
    expect(started.businessId).toBeTruthy();
    expect(getFacebookOAuthUrl).toHaveBeenLastCalledWith(expect.any(String), true, true);

    const state = new URL(started.url).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await app.request(
      `/api/v1/auth/facebook/callback?code=abc&state=${encodeURIComponent(state!)}`,
    );
    expect(callback.status).toBe(302);
    const location = callback.headers.get('location') ?? '';
    expect(location).toContain('/api2/ext-service/internal_facebook_url?token=');

    const token = new URL(location).searchParams.get('token');
    expect(token).toBeTruthy();

    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('ok', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const internal = await app.request(
      `/api2/ext-service/internal_facebook_url?token=${encodeURIComponent(token!)}`,
    );
    expect(internal.status).toBe(200);
    const internalBody = (await internal.json()) as {
      businessId: string;
      posted: Array<{ pageId: string; pageName: string }>;
      failed: unknown[];
    };
    expect(internalBody.businessId).toBe(started.businessId);
    expect(internalBody.posted).toHaveLength(1);
    expect(internalBody.posted[0]).toMatchObject({ pageId: 'PAGE_1', pageName: 'Page One' });

    expect(fetchMock).toHaveBeenCalledWith(
      externalUrl,
      expect.objectContaining({ method: 'POST' }),
    );
    const postedBody = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(postedBody).toEqual({
      businessId: started.businessId,
      pageName: 'Page One',
      pageId: 'PAGE_1',
    });

    const connected = await app.request(`/api2/ext-service/${service.id}/connectChannel`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ pageId: 'PAGE_1', businessId: started.businessId }),
    });
    expect(connected.status).toBe(200);
    const connectedBody = (await connected.json()) as {
      status: string;
      pageId: string;
      name: string;
      webhookSubscribed: boolean;
    };
    expect(connectedBody).toMatchObject({
      status: 'connected',
      pageId: 'PAGE_1',
      name: 'Page One',
      webhookSubscribed: true,
    });
    expect(getPageIdForToken).toHaveBeenCalledWith('page-token-1');
    expect(subscribeFacebookPageToWebhooks).toHaveBeenCalledWith('PAGE_1', 'page-token-1');

    const stored = await getExternalServiceChannel(service.id, 'PAGE_1', 'facebook');
    expect(stored?.accessToken).toBe('page-token-1');
    expect(stored?.refreshToken).toBe('long-lived-token');
  });

  it('connects a channel from an explicit token when no pending OAuth row exists', async () => {
    const service = await createService('Direct', `direct-${crypto.randomUUID()}`);
    const res = await app.request(`/api2/ext-service/${service.id}/connectChannel`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pageId: 'PAGE_DIRECT',
        platform: 'facebook',
        accessToken: 'page-token-direct',
        name: 'Page Direct',
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('connected');
  });

  it('sends text, media, comment replies, seen and typing through the stored channel', async () => {
    const service = await createService('Sender', `sender-${crypto.randomUUID()}`);
    await upsertExternalServiceChannel({
      serviceId: service.id,
      name: 'Page Send',
      platform: 'facebook',
      accessToken: 'page-token-send',
      platformChannelId: 'PAGE_SEND',
    });

    const text = await app.request(`/api2/ext-service/${service.id}/SendMessage`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pageId: 'PAGE_SEND',
        recipientId: 'USER_1',
        message: 'Hello there',
        platformType: 'facebook',
      }),
    });
    expect(text.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith('page-token-send', 'USER_1', 'Hello there', {
      platform: 'facebook',
    });

    const media = await app.request(`/api2/ext-service/${service.id}/SendMessage`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pageId: 'PAGE_SEND',
        recipientId: 'USER_1',
        mediaUrl: 'https://cdn.example.com/a.jpg',
        mediaType: 'image',
        platformType: 'facebook',
      }),
    });
    expect(media.status).toBe(200);
    expect(sendMediaMessage).toHaveBeenCalledWith(
      'page-token-send',
      'USER_1',
      'https://cdn.example.com/a.jpg',
      'image',
    );

    const comment = await app.request(`/api2/ext-service/${service.id}/sendCommentReply`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        pageId: 'PAGE_SEND',
        postId: 'POST_1',
        commentId: 'COMMENT_1',
        message: 'Thanks for asking',
        platformType: 'facebook',
      }),
    });
    expect(comment.status).toBe(200);
    expect(replyToFacebookComment).toHaveBeenCalledWith(
      'page-token-send',
      'COMMENT_1',
      'Thanks for asking',
    );
    expect(((await comment.json()) as { replyId: string }).replyId).toBe('REPLY_1');

    const seen = await app.request(`/api2/ext-service/${service.id}/SendMessageSeenReq`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ pageId: 'PAGE_SEND', recipientId: 'USER_1', platformType: 'facebook' }),
    });
    expect(seen.status).toBe(200);
    expect(senderAction).toHaveBeenCalledWith('page-token-send', 'USER_1', 'mark_seen');

    const typing = await app.request(`/api2/ext-service/${service.id}/SendMessageTypingReq`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ pageId: 'PAGE_SEND', recipientId: 'USER_1', platformType: 'facebook' }),
    });
    expect(typing.status).toBe(200);
    expect(senderAction).toHaveBeenCalledWith('page-token-send', 'USER_1', 'typing_on');
  });

  it('404s when the page is not connected to the service', async () => {
    const service = await createService('Empty', `empty-${crypto.randomUUID()}`);
    const res = await app.request(`/api2/ext-service/${service.id}/SendMessage`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ pageId: 'NOPE', recipientId: 'USER_1', message: 'Hi' }),
    });
    expect(res.status).toBe(404);
  });

  it('keeps the page-selection token helper compatible with the external flow', async () => {
    // The callback path uses the same signed token; this guards the extra field that lets
    // internal_facebook_url know where to post.
    const token = await createFacebookPagesSelectionToken({
      businessId: 'biz-1',
      userId: 'ext-service',
      pages: [{ id: 'PAGE_1', name: 'Page One', access_token: 'page-token-1' }],
      externalRedirectUrl: 'https://external.example.com/hook',
    });
    const { verifyFacebookPagesSelectionToken } = await import('@repo/integrations/facebook');
    const verified = await verifyFacebookPagesSelectionToken(token);
    expect(verified?.externalRedirectUrl).toBe('https://external.example.com/hook');
  });
});
