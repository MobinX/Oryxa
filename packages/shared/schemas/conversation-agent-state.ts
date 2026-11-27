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
    shippingCost: z.number().optional(),
    transactionId: z.string().optional(),
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
  /**
   * The last set of chips that actually reached the customer. Separate from
   * `lastSuggestions`, which is cleared whenever the customer answers: a duplicate row is
   * still a duplicate even if the customer typed something in between.
   */
  lastSentSuggestions: z.array(z.string()).default([]),
  /**
   * True after an identical chip set was suppressed once. The next identical set is then
   * allowed through, so the agent can repeat a question when it really needs to.
   */
  suggestionRepeatSkipped: z.boolean().default(false),
  salesPlan: z
    .object({
      goal: z.enum(['close_order', 'upsell_combo', 'recover_objection', 'post_order_support']).default('close_order'),
      stage: z.enum(['hook', 'discovery', 'pitch', 'price_objection', 'trust_objection', 'closing', 'won', 'declined']).default('hook'),
      nextMove: z.string().max(120).optional(),
      buyerClues: z
        .object({
          occasion: z.string().max(40).optional(),
          budgetBdt: z.number().optional(),
          priorityItem: z.string().max(60).optional(),
          objections: z.array(z.string()).max(4).default([]),
        })
        .default({}),
      turnsWithoutProgress: z.number().int().default(0),
      closedReason: z.enum(['order_placed', 'explicit_refusal', 'timeout', 'escalated']).nullable().default(null),
    })
    .optional(),
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
  if (state.salesPlan) compact.salesPlan = state.salesPlan;

  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : '';
}

const PLAN_REGEX = /\n?<<PLAN:\s*(.+?)>>/gi;

export type SalesPlan = NonNullable<ConversationAgentState['salesPlan']>;

const VALID_GOALS = new Set(['close_order', 'upsell_combo', 'recover_objection', 'post_order_support']);
const VALID_STAGES = new Set(['hook', 'discovery', 'pitch', 'price_objection', 'trust_objection', 'closing', 'won', 'declined']);
const VALID_CLOSED_REASONS = new Set(['order_placed', 'explicit_refusal', 'timeout', 'escalated']);

export function extractSalesPlan(rawText: string): { text: string; plan: Record<string, unknown> | null } {
  const matches = [...rawText.matchAll(PLAN_REGEX)];
  if (matches.length === 0) return { text: rawText.trim(), plan: null };
  const lastMatch = matches[matches.length - 1];
  const plan: Record<string, unknown> = {};
  const body = lastMatch[1] ?? '';
  for (const m of body.matchAll(/(\w+)=("([^"]*)"|'([^']*)'|([^|\s]+))/g)) {
    const key = m[1];
    const val = m[3] ?? m[4] ?? m[5];
    if (key && val !== undefined) plan[key] = val;
  }
  const text = rawText.replace(PLAN_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, plan: Object.keys(plan).length > 0 ? plan : null };
}

export function mergeSalesPlan(
  existing: ConversationAgentState['salesPlan'] | undefined,
  extracted: Record<string, unknown> | null,
): SalesPlan {
  const base: SalesPlan = {
    goal: existing?.goal ?? 'close_order',
    stage: existing?.stage ?? 'hook',
    nextMove: existing?.nextMove,
    buyerClues: {
      occasion: existing?.buyerClues?.occasion,
      budgetBdt: existing?.buyerClues?.budgetBdt,
      priorityItem: existing?.buyerClues?.priorityItem,
      objections: [...(existing?.buyerClues?.objections ?? [])],
    },
    turnsWithoutProgress: existing?.turnsWithoutProgress ?? 0,
    closedReason: existing?.closedReason ?? null,
  };
  if (!extracted) return base;

  const goalVal = String(extracted.goal ?? '');
  if (VALID_GOALS.has(goalVal)) base.goal = goalVal as SalesPlan['goal'];

  const stageVal = String(extracted.stage ?? '');
  const prevStage = base.stage;
  if (VALID_STAGES.has(stageVal)) base.stage = stageVal as SalesPlan['stage'];

  const nextVal = extracted.next ?? extracted.nextMove;
  if (typeof nextVal === 'string' && nextVal.trim()) {
    base.nextMove = nextVal.trim().slice(0, 120);
  }

  const occasionVal = extracted.occasion;
  if (typeof occasionVal === 'string' && occasionVal.trim()) {
    base.buyerClues.occasion = occasionVal.trim().slice(0, 40);
  }

  const rawBudget = extracted.budget ?? extracted.budgetBdt;
  if (rawBudget !== undefined) {
    const parsedBudget = Number(String(rawBudget).replace(/[^\d.]/g, ''));
    if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
      base.buyerClues.budgetBdt = parsedBudget;
    }
  }

  const priorityVal = extracted.priority ?? extracted.priorityItem;
  if (typeof priorityVal === 'string' && priorityVal.trim()) {
    base.buyerClues.priorityItem = priorityVal.trim().slice(0, 60);
  }

  const objectionVal = extracted.objection ?? extracted.objections;
  if (typeof objectionVal === 'string' && objectionVal.trim()) {
    const obj = objectionVal.trim();
    if (!base.buyerClues.objections.includes(obj)) {
      base.buyerClues.objections = [...base.buyerClues.objections, obj].slice(-4);
    }
  }

  const closedVal = String(extracted.closedReason ?? '');
  if (VALID_CLOSED_REASONS.has(closedVal)) {
    base.closedReason = closedVal as SalesPlan['closedReason'];
  }

  if (base.stage !== prevStage || base.stage === 'won') {
    base.turnsWithoutProgress = 0;
  } else if (base.closedReason === null) {
    base.turnsWithoutProgress += 1;
  }

  return base;
}
