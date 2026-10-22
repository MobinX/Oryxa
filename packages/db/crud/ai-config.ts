import { and, eq, isNull, asc, desc } from 'drizzle-orm';
import { db } from '@db/client';
import { channelAiConfigs, businessProfiles, knowledgeEntries, channels, businesses } from '@db/schema';
import {
  channelAiConfigSchema,
  commentBehaviorSchema,
  businessProfileSchema,
  knowledgeEntrySchema,
} from '@repo/shared';

/**
 * The AI Configuration Studio's data (spec B/F). Three tables, one rule: nothing is
 * fabricated. Rows are created empty (or with the reviewed defaults) and the operator
 * writes the content; the agent only ever reads what is here.
 */

export type ChannelAiConfigRow = typeof channelAiConfigs.$inferSelect;

/** Absent row means "all defaults" — the agent answers as it always has. */
export async function getChannelAiConfig(channelId: string): Promise<ChannelAiConfigRow | null> {
  return (await db.query.channelAiConfigs.findFirst({ where: eq(channelAiConfigs.channelId, channelId) })) ?? null;
}

/**
 * The config a run actually obeys: either the stored row, or the plausible defaults the
 * schema itself carries. Written as a real row on the first explicit save.
 */
export async function resolveChannelAiConfig(
  channelId: string,
): Promise<ChannelAiConfigRow> {
  const existing = await getChannelAiConfig(channelId);
  if (existing) return existing;
  return {
    id: '',
    channelId,
    aiEnabled: true,
    aiCommentsEnabled: true,
    privateRepliesEnabled: true,
    autoReply: true,
    confidenceThreshold: '0.60',
    maxReplyLength: 1000,
    tone: 'friendly',
    language: 'auto',
    perChannelInstructions: null,
    leadQuestions: [],
    escalationRules: {},
    commentBehavior: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function saveChannelAiConfig(channelId: string, input: unknown): Promise<ChannelAiConfigRow | null> {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), isNull(channels.deletedAt)),
  });
  if (!channel) return null;

  const parsed = channelAiConfigSchema.parse(input);

  // The comment behavior the console saves is the closed vocabulary above, not free JSON.
  const patch: Record<string, unknown> = { ...parsed, updatedAt: new Date() };
  if (typeof patch.commentBehavior === 'object' && patch.commentBehavior !== null) {
    patch.commentBehavior = commentBehaviorSchema.parse(patch.commentBehavior);
  }
  delete patch.channelId;

  const [row] = await db
    .insert(channelAiConfigs)
    .values({ ...(patch as typeof channelAiConfigs.$inferInsert), channelId })
    .onConflictDoUpdate({ target: channelAiConfigs.channelId, set: patch })
    .returning();
  return row;
}

export type BusinessProfileRow = typeof businessProfiles.$inferSelect;

export async function getBusinessProfile(businessId: string): Promise<BusinessProfileRow | null> {
  return (await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.businessId, businessId) })) ?? null;
}

export async function saveBusinessProfile(businessId: string, input: unknown): Promise<BusinessProfileRow> {
  await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  const parsed = businessProfileSchema.parse(input);
  const patch: Record<string, unknown> = { ...parsed, updatedAt: new Date() };
  const [row] = await db
    .insert(businessProfiles)
    .values({ businessId, ...parsed })
    .onConflictDoUpdate({ target: businessProfiles.businessId, set: patch })
    .returning();
  return row;
}

export type KnowledgeEntryRow = typeof knowledgeEntries.$inferSelect;

export async function listKnowledgeEntries(businessId: string): Promise<KnowledgeEntryRow[]> {
  return db.query.knowledgeEntries.findMany({
    where: and(eq(knowledgeEntries.businessId, businessId), isNull(knowledgeEntries.deletedAt)),
    orderBy: [desc(knowledgeEntries.active), asc(knowledgeEntries.createdAt)],
  });
}

/** The entries a run may quote: active, live rows only, bounded so a prompt cannot bloat. */
export async function listActiveKnowledge(businessId: string, limit = 30): Promise<KnowledgeEntryRow[]> {
  return db.query.knowledgeEntries.findMany({
    where: and(
      eq(knowledgeEntries.businessId, businessId),
      eq(knowledgeEntries.active, true),
      isNull(knowledgeEntries.deletedAt),
    ),
    orderBy: [asc(knowledgeEntries.createdAt)],
    limit,
  });
}

export async function createKnowledgeEntry(
  businessId: string,
  input: unknown,
): Promise<KnowledgeEntryRow> {
  const parsed = knowledgeEntrySchema.parse(input);
  const [row] = await db
    .insert(knowledgeEntries)
    .values({
      businessId,
      question: parsed.question,
      answer: parsed.answer,
      tags: parsed.tags ?? [],
      active: parsed.active ?? true,
    })
    .returning();
  return row;
}

export async function updateKnowledgeEntry(
  businessId: string,
  entryId: string,
  input: unknown,
): Promise<KnowledgeEntryRow | null> {
  const parsed = knowledgeEntrySchema.partial().parse(input);
  const existing = await db.query.knowledgeEntries.findFirst({
    where: and(
      eq(knowledgeEntries.id, entryId),
      eq(knowledgeEntries.businessId, businessId),
      isNull(knowledgeEntries.deletedAt),
    ),
  });
  if (!existing) return null;
  const [row] = await db
    .update(knowledgeEntries)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(knowledgeEntries.id, entryId))
    .returning();
  return row;
}

export async function deleteKnowledgeEntry(businessId: string, entryId: string) {
  const existing = await db.query.knowledgeEntries.findFirst({
    where: and(
      eq(knowledgeEntries.id, entryId),
      eq(knowledgeEntries.businessId, businessId),
      isNull(knowledgeEntries.deletedAt),
    ),
  });
  if (!existing) return null;
  await db
    .update(knowledgeEntries)
    .set({ deletedAt: new Date() })
    .where(eq(knowledgeEntries.id, entryId));
  return { deleted: true };
}
