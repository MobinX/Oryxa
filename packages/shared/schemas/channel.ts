import { z } from '@hono/zod-openapi';
import { platformSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

export const createAgentInputSchema = z.object({
  name: z.string().min(1).max(255),
  systemPrompt: z.string().min(1),
  platformType: platformSchema,
});

export const updateAgentInputSchema = createAgentInputSchema.partial().extend({
  /** null clears the store's own wording and goes back to Oryxa's built-in text. */
  replyGuidance: z.string().max(12000).nullable().optional(),
  commentReplyGuidance: z.string().max(12000).nullable().optional(),
});

export const selectAgentSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  platformType: platformSchema,
  systemPrompt: z.string().optional(),
  replyGuidance: z.string().nullable().optional(),
  commentReplyGuidance: z.string().nullable().optional(),
  /** False when this store answers with its own row instead of the platform default. */
  followsDefault: z.boolean().optional(),
  createdAt: timestampSchema.optional(),
});

/** What the built-in wording is, so the playground can show it as the box a merchant left empty. */
export const agentGuidanceDefaultsSchema = z.object({
  replyGuidance: z.string(),
  commentReplyGuidance: z.string(),
});

/**
 * The one agent every store answers with until it writes its own — what the operator console edits for
 * all merchants at once. Its id is exposed so the console can say which row it is editing; nothing else
 * joins to it.
 */
export const platformAgentSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  systemPrompt: z.string(),
  replyGuidance: z.string().nullable(),
  commentReplyGuidance: z.string().nullable(),
});

export const updatePlatformAgentInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  systemPrompt: z.string().min(1).max(40000).optional(),
  /** null puts that block back on the reviewed wording in code, same as a merchant emptying their box. */
  replyGuidance: z.string().max(12000).nullable().optional(),
  commentReplyGuidance: z.string().max(12000).nullable().optional(),
});

/**
 * A store answering with its own words rather than the platform default. The console needs to name these:
 * opting out is a keystroke, while reading the fleet's state back was a SQL query.
 */
export const agentOverrideSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  businessName: z.string(),
  agentName: z.string(),
  /** Length, not text: the list says who opted out, it is not a second prompt editor. */
  systemPromptChars: z.number(),
  pages: z.number(),
});

export const agentOverrideReportSchema = z.object({
  following: z.number(),
  overrides: z.array(agentOverrideSchema),
});

export const followDefaultAgentInputSchema = z.object({ agentId: uuidSchema });

export const createAgentOutputSchema = z.object({
  id: uuidSchema,
  createdAt: timestampSchema,
});

export const updateAgentOutputSchema = z.object({
  id: uuidSchema,
  updated: z.boolean(),
});

export const deleteAgentOutputSchema = z.object({ deleted: z.boolean() });

export const createChannelInputSchema = z.object({
  platform: platformSchema,
  apiToken: z.string().min(1),
  platformChannelId: z.string().min(1),
  agentId: uuidSchema.optional(),
  extraInfo: z.string().optional(),
});

export const createChannelOutputSchema = z.object({
  id: uuidSchema,
  status: z.literal('linked'),
});

export const updateChannelInputSchema = createChannelInputSchema.partial();

export const updateChannelOutputSchema = z.object({
  id: uuidSchema,
  updated: z.boolean(),
});

export const deleteChannelOutputSchema = z.object({ deleted: z.boolean() });

export const facebookPendingPagesQuerySchema = z.object({
  token: z.string().min(1),
});

export const facebookAuthQuerySchema = z.object({
  /**
   * The connector's "where are your Pages" answer. Absent means the caller never chose —
   * an old link, or an entry point without the choice — and the deployment decides instead.
   */
  portfolio: z.enum(['true', 'false']).optional(),
});

export const facebookPendingPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
  /**
   * A live channel for this Page exists in another store. The page can't be connected here until
   * that store releases it — and the other store's identity is deliberately not returned.
   */
  heldByOtherStore: z.boolean().default(false),
  /** Portfolio name when the Page was reached through a Meta Business Portfolio. */
  business: z.string().nullable().optional(),
});

export const facebookConnectPagesInputSchema = z.object({
  token: z.string().min(1),
  pageIds: z.array(z.string().min(1)).min(1),
});

export const facebookConnectPagesOutputSchema = z.object({
  connected: z.array(z.object({ id: uuidSchema, pageId: z.string(), pageName: z.string() })),
  skipped: z.array(z.string()),
  failed: z.array(z.object({ pageId: z.string(), error: z.string() })),
});
