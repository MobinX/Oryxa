import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import {
  createPost,
  getPostById,
  listPosts,
  updatePost,
  deletePost,
  insertPostSync,
} from '@repo/db/crud/post';

describe('Post CRUD', () => {
  withPglite();

  it('can create, get, list, update and delete a post', async () => {
    const seed = await seedTestWorld();

    // 1. Create Post
    const post = await createPost(seed.business.id, seed.channel.id, {
      content: 'Hello World',
      productId: seed.product.id,
    });

    expect(post).toBeDefined();
    expect(post.content).toBe('Hello World');
    expect(post.productId).toBe(seed.product.id);
    expect(post.postState).toBe('draft');

    // 2. Get Post
    const fetched = await getPostById(seed.business.id, post.id);
    expect(fetched).toBeDefined();
    expect(fetched?.content).toBe('Hello World');
    expect(fetched?.product?.id).toBe(seed.product.id);
    expect(fetched?.channel?.id).toBe(seed.channel.id);
    expect(fetched?.syncs).toHaveLength(0);

    // 3. List Posts
    const list = await listPosts(seed.business.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(post.id);

    // Filter by channel
    const listFiltered = await listPosts(seed.business.id, { channelId: seed.channel.id });
    expect(listFiltered).toHaveLength(1);

    // Filter by state
    const listDrafts = await listPosts(seed.business.id, { state: 'draft' });
    expect(listDrafts).toHaveLength(1);

    const listScheduled = await listPosts(seed.business.id, { state: 'scheduled' });
    expect(listScheduled).toHaveLength(0);

    // 4. Update Post
    const updated = await updatePost(seed.business.id, post.id, {
      content: 'Hello updated',
      postState: 'scheduled',
      scheduledAt: new Date(),
    });

    expect(updated).toBeDefined();
    expect(updated.content).toBe('Hello updated');
    expect(updated.postState).toBe('scheduled');
    expect(updated.scheduledAt).toBeDefined();

    // Verify it changed in database
    const fetchedUpdated = await getPostById(seed.business.id, post.id);
    expect(fetchedUpdated?.content).toBe('Hello updated');
    expect(fetchedUpdated?.postState).toBe('scheduled');

    // 5. Sync Stats
    const sync = await insertPostSync(post.id, {
      likeCount: 10,
      commentCount: 5,
      shareCount: 2,
      reachCount: 0,
    });
    expect(sync).toBeDefined();
    expect(sync.likeCount).toBe(10);
    expect(sync.commentCount).toBe(5);

    const fetchedWithSync = await getPostById(seed.business.id, post.id);
    expect(fetchedWithSync?.syncs).toHaveLength(1);
    expect(fetchedWithSync?.syncs[0].likeCount).toBe(10);

    // 6. Delete Post
    const deleted = await deletePost(seed.business.id, post.id);
    expect(deleted).toBeDefined();

    const fetchedDeleted = await getPostById(seed.business.id, post.id);
    expect(fetchedDeleted).toBeUndefined();
  });
});
