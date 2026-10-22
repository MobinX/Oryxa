import { z } from '@hono/zod-openapi';
import { messageFromSchema, messageStateSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

export const listConversationsQuerySchema = z.object({
  state: messageStateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  // One page of a single channel's threads. Without it a caller that only wants one Page's
  // conversations has to take the whole store's newest N and filter afterwards — which silently
  // returns nothing once a busier store's other threads fill the page.
  channelId: uuidSchema.optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

export const conversationListItemSchema = z.object({
  id: uuidSchema,
  customerName: z.string().nullable(),
  lastMessageState: messageStateSchema,
  channelId: uuidSchema,
  customerPlatformId: z.string(),
  createdAt: timestampSchema,
  pageName: z.string().nullable().optional(),
  /** True when an operator has taken over (spec E); the AI stays off until resumed. */
  aiPaused: z.boolean().optional(),
});

export const messageSchema = z.object({
  id: uuidSchema,
  from: messageFromSchema,
  /** For `self` rows: `ai` or `human` — null on legacy rows and customer rows. */
  sentBy: z.enum(['ai', 'human']).nullable().optional(),
  content: z.string(),
  contentType: z.string(),
  time: timestampSchema,
  /**
   * Viewable URLs for the pictures this message was sent with, oldest first. Absent when there
   * were none, so a reader that only shows text keeps working — and a photo the bucket would not
   * sign drops out of this list rather than emptying the thread.
   */
  images: z.array(z.string()).optional(),
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
  /**
   * The user message to inject as the customer's inbound text. Empty is allowed next to
   * `imageKeys`, because "is this one in my size?" reaches a real page as one photo no words.
   */
  userMessage: z.string().max(2000),
  /**
   * Storage keys of the pictures the tester attached, in the order they were sent — the same
   * column a Messenger photo lands in, so the agent gets pixels here exactly as on the channel.
   */
  imageKeys: z.array(z.string().min(1)).max(4).optional(),
  /**
   * Optional stable test-user platform ID. Defaults to `test-user-{channelId}`.
   * Re-using the same ID across calls continues the same conversation thread —
   * mirrors how real Facebook DMs work (same PSID = same conversation).
   */
  testUserId: z.string().optional(),
});

export const commentTestRunInputSchema = z.object({
  channelId: uuidSchema,
  businessId: uuidSchema,
  /** The public comment the comment agent is asked to handle. */
  comment: z.string().min(1).max(2000),
  /**
   * Earlier lines on this thread, oldest first, so the agent is tested against a conversation
   * rather than a vacuum. `from: 'self'` reads as a page reply — including one an admin typed.
   */
  history: z
    .array(z.object({ from: z.enum(['customer', 'self']), content: z.string().min(1).max(2000) }))
    .max(20)
    .optional(),
  /** Defaults to `test-commenter-{channelId}`, so repeated runs continue one thread. */
  commenterPlatformId: z.string().min(1).max(120).optional(),
  commenterName: z.string().min(1).max(120).optional(),
  /** Defaults to `TEST_POST`, keeping playground threads off any real post id. */
  postId: z.string().min(1).max(120).optional(),
});
