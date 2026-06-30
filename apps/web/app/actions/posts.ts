'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  syncPost,
  type PostState,
} from '@/lib/api';

export async function createPostAction(
  businessId: string,
  data: {
    channelId: string;
    content: string;
    mediaUrls?: string[];
    scheduledAt?: string | null;
    productId?: string | null;
  },
) {
  const token = await requireAuth();
  const created = await createPost(token, businessId, data);
  revalidatePath(`/b/${businessId}/posts`);
  return created;
}

export async function updatePostAction(
  businessId: string,
  postId: string,
  data: {
    channelId?: string;
    content?: string;
    mediaUrls?: string[];
    scheduledAt?: string | null;
    postState?: PostState;
    platformPostId?: string;
    aiPrompt?: string;
  },
) {
  const token = await requireAuth();
  const updated = await updatePost(token, businessId, postId, data);
  revalidatePath(`/b/${businessId}/posts`);
  return updated;
}

export async function deletePostAction(businessId: string, postId: string) {
  const token = await requireAuth();
  await deletePost(token, businessId, postId);
  revalidatePath(`/b/${businessId}/posts`);
}

export async function publishPostAction(businessId: string, postId: string) {
  const token = await requireAuth();
  const res = await publishPost(token, businessId, postId);
  revalidatePath(`/b/${businessId}/posts`);
  return res;
}

export async function syncPostAction(businessId: string, postId: string) {
  const token = await requireAuth();
  const res = await syncPost(token, businessId, postId);
  revalidatePath(`/b/${businessId}/posts`);
  return res;
}
