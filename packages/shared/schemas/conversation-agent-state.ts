import { z } from 'zod';

const productSchema = z.object({ id: z.string(), name: z.string(), price: z.string() });
const variantSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  price: z.string().optional(),
  stock: z.number().int().optional(),
});

/** Durable facts gathered during one Messenger conversation, never user-authored instructions. */
export const conversationAgentStateSchema = z.object({
  currentProduct: productSchema.nullable().default(null),
  currentVariant: variantSchema.nullable().default(null),
  shownVariants: z.array(variantSchema).default([]),
  rejectedColors: z.array(z.string()).default([]),
  rejectedSizes: z.array(z.string()).default([]),
  preferredAttributes: z.object({
    color: z.string().optional(),
    size: z.string().optional(),
    maxPrice: z.number().optional(),
  }).default({}),
  pendingOrder: z.object({
    productId: z.string().optional(),
    productName: z.string().optional(),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    count: z.number().int().positive().optional(),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
  }).nullable().default(null),
  lastOrder: z.object({
    id: z.string(),
    productName: z.string(),
    variantName: z.string().nullable(),
    count: z.number().int(),
    totalPrice: z.string(),
    state: z.enum(['Pending', 'Acknowledged', 'On delivery', 'Done']),
    createdAt: z.string(),
  }).nullable().default(null),
  catalogCursor: z.object({
    query: z.string().optional(),
    category: z.string().optional(),
    nextOffset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).nullable().default(null),
});

export type ConversationAgentState = z.infer<typeof conversationAgentStateSchema>;

export function parseConversationAgentState(value: unknown): ConversationAgentState {
  const parsed = conversationAgentStateSchema.safeParse(value);
  return parsed.success ? parsed.data : conversationAgentStateSchema.parse({});
}
