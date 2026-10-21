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
    productId: z.string().nullable().optional(),
    productName: z.string(),
    variantId: z.string().nullable().optional(),
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
  languageOverride: z.enum(['bn', 'en']).nullable().optional().default(null),
  lastReplyLanguage: z.enum(['bn', 'en']).nullable().optional().default(null),
  /**
   * The chips on the most recent question. Kept so the next turn can tell a tap (which dismisses
   * them) from a typed answer that ignored them, and avoid putting a second chip row on screen.
   */
  lastSuggestions: z.array(z.string()).default([]),
});

export type ConversationAgentState = z.infer<typeof conversationAgentStateSchema>;

export function parseConversationAgentState(value: unknown): ConversationAgentState {
  const parsed = conversationAgentStateSchema.safeParse(value);
  return parsed.success ? parsed.data : conversationAgentStateSchema.parse({});
}

/**
 * Formats ConversationAgentState by omitting null, undefined, and empty array/object keys.
 * Reduces state injection payload from ~110 tokens to ~15-35 tokens on average.
 */
export function formatCompactAgentState(state: ConversationAgentState): string {
  const compact: Record<string, unknown> = {};

  if (state.currentProduct) compact.currentProduct = state.currentProduct;
  if (state.currentVariant) compact.currentVariant = state.currentVariant;
  if (state.shownVariants && state.shownVariants.length > 0) {
    compact.shownVariants = state.shownVariants.map((v) => ({ id: v.id, name: v.name, color: v.color, size: v.size }));
  }
  if (state.rejectedColors && state.rejectedColors.length > 0) compact.rejectedColors = state.rejectedColors;
  if (state.rejectedSizes && state.rejectedSizes.length > 0) compact.rejectedSizes = state.rejectedSizes;
  if (state.preferredAttributes && Object.keys(state.preferredAttributes).length > 0) {
    compact.preferredAttributes = state.preferredAttributes;
  }
  if (state.pendingOrder) compact.pendingOrder = state.pendingOrder;
  if (state.lastOrder) compact.lastOrder = state.lastOrder;
  if (state.catalogCursor) compact.catalogCursor = state.catalogCursor;
  if (state.languageOverride) compact.languageOverride = state.languageOverride;
  if (state.lastReplyLanguage) compact.lastReplyLanguage = state.lastReplyLanguage;

  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : '';
}
