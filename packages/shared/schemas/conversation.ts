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
  /** False when the merchant turned auto reply off for this thread. */
  autoPilot: z.boolean().optional(),
});

export const updateAutoPilotInputSchema = z.object({
  autoPilot: z.boolean(),
});

export const updateAutoPilotOutputSchema = z.object({
  id: uuidSchema,
  autoPilot: z.boolean(),
});

export const suggestionProductSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  price: z.number(),
  imageUrl: z.string().nullable().optional(),
});

/** One row of the inbox suggestion panel. Nothing here has been sent yet. */
export const inboxSuggestionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('product'),
    productId: uuidSchema,
    variantId: uuidSchema.nullable().optional(),
    title: z.string(),
    price: z.number(),
    imageUrl: z.string().nullable().optional(),
    subtitle: z.string().nullable().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('category'),
    categoryId: uuidSchema,
    name: z.string(),
    productCount: z.number().int(),
    products: z.array(suggestionProductSchema),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('product_info'),
    productId: uuidSchema,
    title: z.string(),
    price: z.number(),
    imageUrl: z.string().nullable().optional(),
    variantCount: z.number().int(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('variant'),
    productId: uuidSchema,
    variantId: uuidSchema,
    title: z.string(),
    variantName: z.string(),
    price: z.number(),
    imageUrl: z.string().nullable().optional(),
    photoCount: z.number().int(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('order'),
    productId: uuidSchema,
    variantId: uuidSchema.nullable().optional(),
    title: z.string(),
    price: z.number(),
    imageUrl: z.string().nullable().optional(),
    count: z.number().int().optional(),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('order_card'),
    orderId: uuidSchema,
    title: z.string(),
    subtitle: z.string(),
    imageUrl: z.string().nullable().optional(),
    state: z.string(),
    total: z.number(),
  }),
]);

export const generateSuggestionsOutputSchema = z.object({
  forMessageId: uuidSchema.nullable(),
  suggestions: z.array(inboxSuggestionSchema),
});

export const sendSuggestionInputSchema = z.object({
  kind: z.enum([
    'product',
    'category',
    'product_list',
    'product_info',
    'product_variant',
    'order_card',
  ]),
  productId: uuidSchema.optional(),
  variantId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
});

export const sendSuggestionOutputSchema = z.object({
  sent: z.boolean(),
  cards: z.number().int(),
});

export const createConversationOrderInputSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  count: z.number().int().positive().max(999).default(1),
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().min(1).max(20),
  customerAddress: z.string().min(1).max(1000),
  shippingCost: z.number().min(0).optional(),
  paymentMethod: z.string().min(1).max(40).optional(),
  /** Required by the API when the payment method is bKash/Nagad. */
  transactionId: z.string().min(1).max(120).optional(),
});

export const createConversationOrderOutputSchema = z.object({
  id: uuidSchema,
  totalPrice: z.number(),
  customerId: uuidSchema.nullable(),
  state: z.string(),
});

export const conversationOrderDefaultsSchema = z.object({
  count: z.number().int(),
  customerPhone: z.string(),
  customerAddress: z.string(),
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
