import { z } from '@hono/zod-openapi';
import { sinceSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

/**
 * Platforms an external service may connect. This is deliberately narrower than the DB
 * `platform` enum: Twitter/TikTok have no external connection flow yet.
 */
export const externalServicePlatformSchema = z.enum(['facebook', 'instagram', 'whatsapp', 'telegram']);

export const createExternalServiceInputSchema = z.object({
  name: z.string().min(1).max(255),
  /** The caller-facing key used by `search?uname=`; URL-safe and stable. */
  uniqueName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, underscore or dash'),
});

export const updateExternalServiceInputSchema = createExternalServiceInputSchema.partial();

export const externalServiceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  uniqueName: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const externalServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  since: sinceSchema,
});

export const externalServiceSearchQuerySchema = z.object({
  id: z.string().uuid().optional(),
  uname: z.string().min(1).max(255).optional(),
  since: sinceSchema,
});

export const externalServiceListOutputSchema = z.object({
  items: z.array(externalServiceSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
});

export const createExternalServiceWebhookInputSchema = z.object({
  url: z.string().url(),
});

export const updateExternalServiceWebhookInputSchema = z.object({
  url: z.string().url(),
});

export const externalServiceWebhookSchema = z.object({
  id: uuidSchema,
  serviceId: uuidSchema,
  url: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const getFacebookConnectOauthUrlInputSchema = z.object({
  /** Where Oryxa posts the selected Page name + id once the Facebook login returns. */
  redirectUrl: z.string().url(),
  /** Optional caller tenant id carried through the flow; generated when omitted. */
  businessId: z.string().min(1).max(255).optional(),
});

export const getFacebookConnectOauthUrlOutputSchema = z.object({
  url: z.string(),
  businessId: z.string(),
});

export const connectExternalChannelInputSchema = z.object({
  /** The Facebook Page id the external redirect received. */
  pageId: z.string().min(1),
  /** Disambiguates the banked OAuth token when the same Page was connected by two callers. */
  businessId: z.string().min(1).max(255).optional(),
  platform: externalServicePlatformSchema.default('facebook'),
  /** Optional direct credentials; when absent the banked OAuth token is redeemed. */
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  name: z.string().min(1).max(255).optional(),
});

export const connectExternalChannelOutputSchema = z.object({
  id: uuidSchema,
  pageId: z.string(),
  name: z.string(),
  platform: externalServicePlatformSchema,
  status: z.literal('connected'),
});

export const sendExternalMessageInputSchema = z.object({
  pageId: z.string().min(1),
  recipientId: z.string().min(1),
  message: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'file']).optional(),
  platformType: externalServicePlatformSchema.default('facebook'),
});

export const sendExternalCommentReplyInputSchema = z.object({
  pageId: z.string().min(1),
  /** The post the comment belongs to; accepted for the caller's convenience. */
  postId: z.string().optional(),
  commentId: z.string().min(1),
  message: z.string().min(1),
  platformType: externalServicePlatformSchema.default('facebook'),
});

export const externalSenderActionInputSchema = z.object({
  pageId: z.string().min(1),
  recipientId: z.string().min(1),
  platformType: externalServicePlatformSchema.default('facebook'),
});

/** One media bubble in an external-service post. */
export const externalPostMediaSchema = z.object({
  mediatype: z.enum(['image', 'video', 'audio', 'file']),
  mediaUrl: z.string().url(),
});
export type ExternalPostMedia = z.infer<typeof externalPostMediaSchema>;

export const createExternalPostInputSchema = z.object({
  pageId: z.string().min(1),
  platform: externalServicePlatformSchema.default('facebook'),
  postContent: z
    .object({
      text: z.string().max(5000).optional(),
      media: z.array(externalPostMediaSchema).max(10).optional(),
    })
    .refine((content) => Boolean(content.text?.trim() || content.media?.length), {
      message: 'A post needs text or at least one media item',
    }),
});

export const updateExternalPostInputSchema = z.object({
  text: z.string().max(5000).min(1),
});

export const externalPostStatsSchema = z.object({
  likeCount: z.number(),
  commentCount: z.number(),
  shareCount: z.number(),
  reachCount: z.number(),
});

export const externalPostSchema = z.object({
  id: z.string(),
  platform: externalServicePlatformSchema,
  pageId: z.string(),
  text: z.string().nullable(),
  media: z.array(externalPostMediaSchema),
  createdAt: z.string(),
});

export const externalPostCommentSchema = z.object({
  id: z.string(),
  text: z.string(),
  commenterId: z.string().nullable(),
  commenterName: z.string().nullable(),
  createdAt: z.string(),
  likeCount: z.number(),
  parentId: z.string().nullable(),
});

