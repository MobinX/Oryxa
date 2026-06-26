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

export const internalRunInputSchema = z.object({
  conversationId: uuidSchema,
});
