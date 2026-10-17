import { CORE_AGENT_PROMPT as DEFAULT_AGENT_PROMPT } from '@repo/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { agents, businesses, defaultAgents } from '@db/schema';

export const DEFAULT_AGENT_NAME = 'Oryxa Sales Agent';

/**
 * The prompt every store's assistant replies with until it writes its own. Merchants do not pick one:
 * a channel is created already bound to an agent, so a Page can never answer a customer with no
 * instructions. This constant only seeds the `default_agent` row — editing it here changes the stores
 * created afterwards, while /admin/default-agent is the edit that reaches the ones replying today.
 */
export { DEFAULT_AGENT_PROMPT };

/**
 * The agent a store replies with. Oldest live row wins: businesses created before the default
 * existed already have one agent of their own, and that is what their channels keep using.
 */
export async function getDefaultAgent(businessId: string) {
  return db.query.agents.findFirst({
    where: and(eq(agents.businessId, businessId), isNull(agents.deletedAt)),
    orderBy: [asc(agents.createdAt)],
  });
}

/** Creates the default agent on demand so an older store is never left without one. */
export async function ensureDefaultAgent(businessId: string) {
  const existing = await getDefaultAgent(businessId);
  if (existing) return existing;

  const [created] = await db
    .insert(agents)
    .values({
      businessId,
      name: DEFAULT_AGENT_NAME,
      systemPrompt: DEFAULT_AGENT_PROMPT,
      platformType: 'facebook',
      // A store gets a row because the webhook will not trigger an agent for a channel without one, not
      // because it asked for its own instructions. So the copy arrives already superseded: the platform
      // default answers, and this text waits until somebody edits it.
      followsDefault: true,
    })
    .returning();
  return created;
}

/** Everything an answering run needs, whichever of the two rows it came from. */
export type AnsweringAgent = {
  id: string;
  name: string;
  systemPrompt: string;
  replyGuidance: string | null;
  commentReplyGuidance: string | null;
};

/** A channel's bound agent row, or nothing when the channel never chose one. */
type AgentOverride = Partial<AnsweringAgent> & {
  id: string;
  name: string;
  systemPrompt: string;
  followsDefault?: boolean | null;
};

/** Blank text is not a wording choice, so an emptied box resolves onward rather than answering with nothing. */
const written = (text: string | null | undefined) => (text && text.trim() ? text : null);

const shape = (row: AnsweringAgent): AnsweringAgent => ({
  id: row.id,
  name: row.name,
  systemPrompt: row.systemPrompt,
  replyGuidance: written(row.replyGuidance),
  commentReplyGuidance: written(row.commentReplyGuidance),
});

/**
 * The agent an operator edits for every merchant at once.
 *
 * Read as a singleton and created on first read, so an environment that never ran the seed still answers
 * instead of going quiet, and two rows from a racing first read are harmless because the oldest is what
 * every reader takes. The prompt it is seeded from stays in this file: copying it into the migration would
 * create a second source that drifts the same way the first one did.
 */
export async function getPlatformAgent(): Promise<AnsweringAgent> {
  const existing = await db.query.defaultAgents.findFirst({ orderBy: [asc(defaultAgents.createdAt)] });
  if (existing) return shape(existing);

  const [created] = await db
    .insert(defaultAgents)
    .values({
      name: DEFAULT_AGENT_NAME,
      systemPrompt: DEFAULT_AGENT_PROMPT,
      platformType: 'facebook',
    })
    .returning();
  return shape(created);
}

/** The operator's edit. Only the console bearer can reach this, through the admin route. */
export async function updatePlatformAgent(input: {
  name?: string;
  systemPrompt?: string;
  replyGuidance?: string | null;
  commentReplyGuidance?: string | null;
}): Promise<AnsweringAgent> {
  const current = await getPlatformAgent();
  const [updated] = await db
    .update(defaultAgents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(defaultAgents.id, current.id))
    .returning();
  return shape(updated ?? current);
}

/**
 * Who answers for a channel: its own row only while that row is an override somebody chose, otherwise the
 * platform default. That is the whole mechanism — an operator's edit lands on every store's next reply, and
 * no store's own writing is deleted to make it happen, so turning one store back into an override is one
 * UPDATE on the flag.
 *
 * A row that predates the flag (absent, not false) stays an override: a fixture or an older read must not
 * silently lose the prompt it was handed.
 *
 * Wording follows the same line in three steps — the store's own block, else the default row's, else the
 * reviewed text in `@agent/guidance` — so a store that only ever edited its prompt keeps riding the
 * operator's wording changes, exactly as it did before this table existed.
 */
export async function resolveAnsweringAgent(override?: AgentOverride | null): Promise<AnsweringAgent> {
  const platform = await getPlatformAgent();
  if (!override || override.followsDefault === true) return platform;

  return {
    id: override.id,
    name: override.name,
    systemPrompt: override.systemPrompt,
    replyGuidance: written(override.replyGuidance) ?? platform.replyGuidance,
    commentReplyGuidance: written(override.commentReplyGuidance) ?? platform.commentReplyGuidance,
  };
}

/**
 * Who is NOT answering with the default, and how many Pages sit behind each one.
 *
 * Opting out takes a keystroke in the playground; reading the fleet back took a SQL query, which is the
 * only way the first override was found. Length is reported rather than the text because this is a list
 * to act on, not a second prompt editor.
 */
export async function getOverrideReport() {
  const rows = await db
    .select({
      id: agents.id,
      businessId: agents.businessId,
      businessName: businesses.name,
      agentName: agents.name,
      systemPromptChars: sql<number>`length(${agents.systemPrompt})::int`,
      pages: sql<number>`(select count(*) from channels ch
                           where ch.agent_id = ${agents.id} and ch.deleted_at is null)::int`,
      followsDefault: agents.followsDefault,
    })
    .from(agents)
    .innerJoin(businesses, eq(businesses.id, agents.businessId))
    .where(and(isNull(agents.deletedAt), isNull(businesses.deletedAt)))
    .orderBy(desc(businesses.createdAt));

  return {
    following: rows.filter((row) => row.followsDefault).length,
    overrides: rows.filter((row) => !row.followsDefault).map((row) => ({
      id: row.id,
      businessId: row.businessId,
      businessName: row.businessName,
      agentName: row.agentName,
      systemPromptChars: Number(row.systemPromptChars),
      pages: Number(row.pages),
    })),
  };
}

/**
 * Bring one store back onto the fleet default.
 *
 * Deliberately a flag and nothing else: the store's own text stays in its row, so the operator who
 * clicks this for somebody who wrote their own rules can be un-clicked the same way. Deleting the text
 * would make a second thoughtless click cost a merchant their work.
 */
export async function makeAgentFollowDefault(agentId: string) {
  const [updated] = await db
    .update(agents)
    .set({ followsDefault: true })
    .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
    .returning({ id: agents.id });
  return updated ?? null;
}
