import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

const invokeMock = vi.fn(async () => ({ content: 'Generated copy from AI' }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    invoke: invokeMock,
  })),
}));

const publishMock = vi.fn(async () => 'FB_POST_123');
const syncStatsMock = vi.fn(async () => ({
  likeCount: 42,
  commentCount: 7,
  shareCount: 3,
  reachCount: 0,
}));

vi.mock('@repo/integrations', () => ({
  getPublisher: () => ({
    publish: publishMock,
    syncStats: syncStatsMock,
  }),
}));

describe('Posts API', () => {
  withPglite();

  it('can perform full posts lifecycle via API', async () => {
    const seed = await seedTestWorld();

    // 1. Create a draft post
    const createRes = await app.request(`/api/v1/${seed.business.id}/posts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        channelId: seed.channel.id,
        content: 'Original draft',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.content).toBe('Original draft');
    expect(created.postState).toBe('draft');

    const postId = created.id;

    // 2. Get post detail
    const getRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const detail = await getRes.json();
    expect(detail.id).toBe(postId);
    expect(detail.content).toBe('Original draft');

    // 3. Update post
    const patchRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        content: 'Updated draft content',
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.content).toBe('Updated draft content');

    // 4. List posts
    const listRes = await app.request(`/api/v1/${seed.business.id}/posts`, {
      headers: authHeaders(),
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(postId);

    // 5. AI Generate post from product
    invokeMock.mockClear();
    const generateRes = await app.request(`/api/v1/${seed.business.id}/posts/generate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        channelId: seed.channel.id,
        productId: seed.product.id,
        tone: 'playful',
      }),
    });
    expect(generateRes.status).toBe(200);
    const generated = await generateRes.json();
    expect(typeof generated.content).toBe('string');
    expect(generated.content.length).toBeGreaterThan(0);

    // 6. AI Tune post draft
    const tuneRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}/tune`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        instruction: 'make it sound exciting',
      }),
    });
    expect(tuneRes.status).toBe(200);
    const tuned = await tuneRes.json();
    expect(typeof tuned.content).toBe('string');
    expect(tuned.content.length).toBeGreaterThan(0);
    expect(tuned.id).toBe(postId);

    // 7. Publish post
    publishMock.mockClear();
    const publishRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(publishRes.status).toBe(200);
    const publishResult = await publishRes.json();
    expect(publishResult.platformPostId).toBe('FB_POST_123');
    expect(publishMock).toHaveBeenCalled();

    // Verify state transitioned to published
    const getResPublished = await app.request(`/api/v1/${seed.business.id}/posts/${postId}`, {
      headers: authHeaders(),
    });
    const detailPublished = await getResPublished.json();
    expect(detailPublished.postState).toBe('published');
    expect(detailPublished.platformPostId).toBe('FB_POST_123');

    // 8. Sync Stats
    syncStatsMock.mockClear();
    const syncRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}/sync`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(syncRes.status).toBe(200);
    const syncResult = await syncRes.json();
    expect(syncResult.likeCount).toBe(42);
    expect(syncResult.commentCount).toBe(7);
    expect(syncStatsMock).toHaveBeenCalled();

    // Verify latest stats are in detail
    const getResSynced = await app.request(`/api/v1/${seed.business.id}/posts/${postId}`, {
      headers: authHeaders(),
    });
    const detailSynced = await getResSynced.json();
    expect(detailSynced.latestSync).toBeDefined();
    expect(detailSynced.latestSync.likeCount).toBe(42);

    // 9. Delete post
    const deleteRes = await app.request(`/api/v1/${seed.business.id}/posts/${postId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(200);
    const deleteResult = await deleteRes.json();
    expect(deleteResult.deleted).toBe(true);
  });
});
