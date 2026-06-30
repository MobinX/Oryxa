import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from './base';

export const postStateSchema = z.enum(['draft', 'scheduled', 'published', 'failed']).openapi('PostState');

export const createPostInputSchema = z.object({
  channelId: uuidSchema,
  content: z.string().default(''),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledAt: timestampSchema.nullable().optional(),
  productId: uuidSchema.nullable().optional(),
}).openapi('CreatePostInput');

export const updatePostInputSchema = z.object({
  channelId: uuidSchema.optional(),
  content: z.string().optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledAt: timestampSchema.nullable().optional(),
  postState: postStateSchema.optional(),
  platformPostId: z.string().optional(),
  aiPrompt: z.string().optional(),
}).openapi('UpdatePostInput');

export const postSyncSchema = z.object({
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  shareCount: z.number().int(),
  reachCount: z.number().int(),
  syncedAt: timestampSchema,
}).openapi('PostSync');

export const postListItemSchema = z.object({
  id: uuidSchema,
  channelId: uuidSchema,
  productId: uuidSchema.nullable().optional(),
  content: z.string(),
  mediaUrls: z.array(z.string().url()).nullable().optional(),
  postState: postStateSchema,
  platformPostId: z.string().nullable().optional(),
  scheduledAt: timestampSchema.nullable().optional(),
  publishedAt: timestampSchema.nullable().optional(),
  createdAt: timestampSchema,
}).openapi('PostListItem');

export const postDetailSchema = postListItemSchema.extend({
  aiPrompt: z.string().nullable().optional(),
  latestSync: postSyncSchema.nullable().optional(),
}).openapi('PostDetail');

export const generatePostInputSchema = z.object({
  channelId: uuidSchema,
  productId: uuidSchema,
  tone: z.string().optional(),
}).openapi('GeneratePostInput');

export const tunePostInputSchema = z.object({
  instruction: z.string().min(1),
}).openapi('TunePostInput');

export const publishPostOutputSchema = z.object({
  platformPostId: z.string(),
  publishedAt: timestampSchema,
}).openapi('PublishPostOutput');

export const syncPostOutputSchema = postSyncSchema.openapi('SyncPostOutput');
