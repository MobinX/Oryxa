import { z } from '@hono/zod-openapi';
import { messageFromSchema, messageStateSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

export const listConversationsQuerySchema = z.object({
  state: messageStateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const conversationListItemSchema = z.object({
  id: uuidSchema,
  customerName: z.string().nullable(),
  lastMessageState: messageStateSchema,
  channelId: uuidSchema,
  customerPlatformId: z.string(),
  createdAt: timestampSchema,
});

export const messageSchema = z.object({
  id: uuidSchema,
  from: messageFromSchema,
  content: z.string(),
  contentType: z.string(),
  time: timestampSchema,
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const createMessageInputSchema = z.object({
  content: z.string().min(1),
  contentType: z.enum(['text', 'image']).default('text'),
});

export const createMessageOutputSchema = z.object({
  id: uuidSchema,
  time: timestampSchema,
});

export const updateConversationStateInputSchema = z.object({
  state: messageStateSchema,
});

export const updateConversationStateOutputSchema = z.object({
  id: uuidSchema,
  updatedState: messageStateSchema,
});

export const deleteConversationOutputSchema = z.object({ deleted: z.boolean() });
export const deleteMessageOutputSchema = z.object({ deleted: z.boolean() });

export const internalRunInputSchema = z.object({
  conversationId: uuidSchema,
});

export const internalRunCommentInputSchema = z.object({
  commentThreadId: uuidSchema,
});

export const testRunInputSchema = z.object({
  /** The channel UUID to simulate the inbound message on. Must have an agent assigned. */
  channelId: uuidSchema,
  /** The business UUID that owns the channel. */
  businessId: uuidSchema,
  /** The user message to inject as the customer's inbound text. */
  userMessage: z.string().min(1).max(2000),
  /**
   * Optional stable test-user platform ID. Defaults to `test-user-{channelId}`.
   * Re-using the same ID across calls continues the same conversation thread —
   * mirrors how real Facebook DMs work (same PSID = same conversation).
   */
  testUserId: z.string().optional(),
});
