import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { flushBackground } from '@api/lib/background';
import { webhookHeaders } from '../helpers/meta-sign';
import {
  createExternalService,
  createExternalServiceWebhook,
  upsertExternalServiceChannel,
} from '@repo/db/crud/external-service';

// The webhook verifies signatures with META_APP_SECRET; pin it so this suite does not depend
// on global env ordering.
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_VERIFY_TOKEN = 'test-token';

vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: vi.fn(async () => ({ status: 'done' })),
  runAgentForConversation: vi.fn(),
}));

vi.mock('@repo/integrations/facebook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/integrations/facebook')>();
  return {
    ...actual,
    getFacebookUserProfile: vi.fn(async () => ({
      name: 'FB Sender',
      avatar: 'https://fb.example/avatar.png',
    })),
    sendMessage: vi.fn(async () => 'MOCK_MSG_ID'),
    senderAction: vi.fn(async () => undefined),
    replyToFacebookComment: vi.fn(async () => 'MOCK_REPLY_ID'),
  };
});

type Seed = {
  pageId: string;
  serviceId: string;
  webhookUrls: string[];
};

/**
 * An external service owning a Page that no store channel holds. The fan-out must reach it
 * anyway, which is the whole point of running it before the store-channel lookup.
 */
async function seedExternalPage(webhookCount = 1): Promise<Seed> {
  const service = await createExternalService({
    name: 'External Integration',
    uniqueName: `ext-${crypto.randomUUID()}`,
  });
  const pageId = `EXT_${crypto.randomUUID()}`;

  const webhookUrls: string[] = [];
  for (let i = 0; i < webhookCount; i++) {
    const url = `https://hooks.example.com/${crypto.randomUUID()}`;
    await createExternalServiceWebhook(service.id, url);
    webhookUrls.push(url);
  }

  await upsertExternalServiceChannel({
    serviceId: service.id,
    name: 'External Page',
    platform: 'facebook',
    accessToken: 'ext-page-token',
    platformChannelId: pageId,
  });

  return { pageId, serviceId: service.id, webhookUrls };
}

async function postWebhook(payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await fbWebhookRouter.request('http://localhost/facebook', {
    method: 'POST',
    headers: await webhookHeaders(body),
    body,
  });
  // The route acks immediately and processes the entry in the background.
  await flushBackground();
  return res;
}

type Delivered = {
  payload_type: 'message' | 'comment';
  pageId: string;
  customerInfo: { id: string; name: string | null; avatar: string | null };
  payload: Record<string, unknown>;
};

function deliveredTo(fetchMock: ReturnType<typeof vi.fn>, url: string): Delivered[] {
  return fetchMock.mock.calls
    .filter(([calledUrl]) => calledUrl === url)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Delivered);
}

describe('Facebook webhook → external service fan-out', () => {
  withPglite();

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('forwards a Messenger text message to every webhook of the service', async () => {
    const seed = await seedExternalPage(2);

    const res = await postWebhook({
      object: 'page',
      entry: [
        {
          id: seed.pageId,
          messaging: [
            { sender: { id: 'USER_1' }, message: { text: 'Do you ship to Dhaka?', mid: 'mid-1' } },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);

    for (const url of seed.webhookUrls) {
      const delivered = deliveredTo(fetchMock, url);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toEqual({
        payload_type: 'message',
        pageId: seed.pageId,
        customerInfo: { id: 'USER_1', name: 'FB Sender', avatar: 'https://fb.example/avatar.png' },
        payload: { type: 'text', text: 'Do you ship to Dhaka?' },
      });
    }
  });

  it('forwards a media message with its media URL', async () => {
    const seed = await seedExternalPage();

    await postWebhook({
      object: 'page',
      entry: [
        {
          id: seed.pageId,
          messaging: [
            {
              sender: { id: 'USER_2' },
              message: {
                mid: 'mid-2',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://cdn.example.com/photo.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const delivered = deliveredTo(fetchMock, seed.webhookUrls[0]!);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      payload_type: 'message',
      pageId: seed.pageId,
      customerInfo: { id: 'USER_2' },
      payload: { type: 'media', mediatype: 'image', mediaUrl: 'https://cdn.example.com/photo.jpg' },
    });
  });

  it('forwards a page feed comment with the comment and post ids', async () => {
    const seed = await seedExternalPage();

    await postWebhook({
      object: 'page',
      entry: [
        {
          id: seed.pageId,
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: 'COMMENT_1',
                post_id: 'POST_1',
                message: 'Is this in stock?',
                from: { id: 'USER_3', name: 'Commenter Name' },
              },
            },
          ],
        },
      ],
    });

    const delivered = deliveredTo(fetchMock, seed.webhookUrls[0]!);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toEqual({
      payload_type: 'comment',
      pageId: seed.pageId,
      customerInfo: { id: 'USER_3', name: 'Commenter Name', avatar: null },
      payload: {
        type: 'text',
        text: 'Is this in stock?',
        commentId: 'COMMENT_1',
        postId: 'POST_1',
      },
    });
  });

  it('forwards an Instagram comment to an Instagram-connected service', async () => {
    const service = await createExternalService({
      name: 'Instagram Integration',
      uniqueName: `ig-${crypto.randomUUID()}`,
    });
    const pageId = `IG_${crypto.randomUUID()}`;
    const url = `https://hooks.example.com/${crypto.randomUUID()}`;
    await createExternalServiceWebhook(service.id, url);
    await upsertExternalServiceChannel({
      serviceId: service.id,
      name: 'IG Account',
      platform: 'instagram',
      accessToken: 'ig-token',
      platformChannelId: pageId,
    });

    const body = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: pageId,
          changes: [
            {
              field: 'comments',
              value: {
                comment_id: 'IG_COMMENT',
                text: 'Price?',
                from: { id: 'IG_USER', username: 'ig_user' },
                media: { id: 'IG_MEDIA' },
              },
            },
          ],
        },
      ],
    });
    const res = await fbWebhookRouter.request('http://localhost/instagram', {
      method: 'POST',
      headers: await webhookHeaders(body),
      body,
    });
    expect(res.status).toBe(200);
    await flushBackground();

    const delivered = deliveredTo(fetchMock, url);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      payload_type: 'comment',
      pageId,
      customerInfo: { id: 'IG_USER', name: 'ig_user', avatar: null },
      payload: { type: 'text', text: 'Price?', commentId: 'IG_COMMENT', postId: 'IG_MEDIA' },
    });
  });

  it('does not call any webhook for a Page no external service owns', async () => {
    await postWebhook({
      object: 'page',
      entry: [
        {
          id: `UNKNOWN_${crypto.randomUUID()}`,
          messaging: [{ sender: { id: 'USER_4' }, message: { text: 'Hello', mid: 'mid-4' } }],
        },
      ],
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps delivering to the other webhooks when one endpoint fails', async () => {
    const seed = await seedExternalPage(2);
    const [failing, healthy] = seed.webhookUrls;

    fetchMock.mockImplementation(async (url: string) => {
      if (url === failing) throw new Error('connection refused');
      return new Response('ok', { status: 200 });
    });

    await postWebhook({
      object: 'page',
      entry: [
        {
          id: seed.pageId,
          messaging: [{ sender: { id: 'USER_5' }, message: { text: 'Still there?', mid: 'mid-5' } }],
        },
      ],
    });

    expect(deliveredTo(fetchMock, healthy!)).toHaveLength(1);
  });
});
