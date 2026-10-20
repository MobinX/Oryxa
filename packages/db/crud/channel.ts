import { eq, and, isNull, ne, or, isNotNull, asc } from 'drizzle-orm';
import { db } from '@db/client';
import { agents, channels } from '@db/schema';
import { ensureDefaultAgent } from '@repo/db/crud/default-agent';
import {
  createAgentInputSchema,
  updateAgentInputSchema,
  createChannelInputSchema,
  updateChannelInputSchema,
} from '@repo/shared';

/**
 * A platform account (a Facebook Page, a WhatsApp number) can be connected to exactly one
 * live channel, and therefore one business. Inbound webhooks arrive carrying only the account
 * id, so a second live owner is not merely a duplicate row: the resolver picks one and the
 * other business silently never sees its own customers, while the chosen one receives them.
 * `channels_platform_channel_live_idx` is what actually refuses it; this check exists first
 * so callers get this sentence instead of a raw unique-violation. The owner is deliberately
 * not named — telling one tenant which other tenant holds the Page leaks their account.
 */
export class ChannelTakenError extends Error {
  constructor() {
    super('This page is already connected to another store. Disconnect it there first.');
    this.name = 'ChannelTakenError';
  }
}

type ChannelPlatform = 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter';

async function assertSoleLiveOwner(
  businessId: string,
  platform: ChannelPlatform,
  platformChannelId: string,
) {
  const takenBy = await db.query.channels.findFirst({
    where: and(
      eq(channels.platform, platform),
      eq(channels.platformChannelId, platformChannelId),
      isNull(channels.deletedAt),
      // An operator-owned channel (businessId null) also blocks a store from taking the page.
      or(isNull(channels.businessId), ne(channels.businessId, businessId)),
    ),
    columns: { id: true },
  });
  if (takenBy) throw new ChannelTakenError();
}

export async function createAgent(businessId: string, input: unknown) {
  const parsed = createAgentInputSchema.parse(input);
  const [agent] = await db
    .insert(agents)
    // The prompt in this call is somebody's own writing — the input schema requires one — so the row
    // arrives as an override. The column's default is true for the copies `ensureDefaultAgent` mints,
    // which nobody authored; inheriting it here would dorm the text its author just supplied.
    .values({ ...parsed, businessId, followsDefault: false })
    .returning();
  return agent;
}

export async function getAgentById(businessId: string, agentId: string) {
  return db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.businessId, businessId), isNull(agents.deletedAt)),
  });
}

export class ChannelAgentError extends Error {
  constructor() {
    super("That agent doesn't belong to this store.");
    this.name = 'ChannelAgentError';
  }
}

/**
 * A channel's agent decides which system prompt answers its customers, so an agent id arriving on
 * a channel write has to be the caller's own — otherwise one store's page starts replying with
 * another store's persona.
 */
async function assertAgentIsOwned(businessId: string, agentId: string | null | undefined) {
  if (!agentId) return;
  const owned = await getAgentById(businessId, agentId);
  if (!owned) throw new ChannelAgentError();
}

export async function listAgents(businessId: string) {
  return db.query.agents.findMany({
    where: and(eq(agents.businessId, businessId), isNull(agents.deletedAt)),
  });
}

export async function updateAgent(businessId: string, agentId: string, input: unknown) {
  const parsed = updateAgentInputSchema.parse(input);
  const agent = await getAgentById(businessId, agentId);
  if (!agent) return null;
  // Writing prompt or wording text here means the store is answering with its own words, so the row stops
  // following the platform default. Only the flag changes meaning: whatever the row held before is still
  // there, and clearing the flag brings it back.
  //
  // Only NON-EMPTY text claims ownership. A box emptied on purpose, or a save that sent nothing but nulls,
  // is the store handing its wording back to the default — flipping the flag there would turn "clear my
  // wording" into "stop following the wording", which is the opposite of what the caller asked for.
  const ownsItsWords =
    Boolean(parsed.systemPrompt?.trim()) ||
    Boolean(parsed.replyGuidance?.trim()) ||
    Boolean(parsed.commentReplyGuidance?.trim());
  const [updated] = await db
    .update(agents)
    .set({ ...parsed, ...(ownsItsWords ? { followsDefault: false } : {}) })
    .where(eq(agents.id, agentId))
    .returning();
  return { id: updated.id, updated: true };
}

export async function deleteAgent(businessId: string, agentId: string) {
  const agent = await getAgentById(businessId, agentId);
  if (!agent) return null;
  await db
    .update(agents)
    .set({ deletedAt: new Date() })
    .where(eq(agents.id, agentId));
  // Re-point the channels it was answering, rather than leaving them with no agent at all —
  // a channel with no agent goes silent on its customers with nothing in the UI to explain it.
  const replacement = await ensureDefaultAgent(businessId);
  await db
    .update(channels)
    .set({ agentId: replacement.id })
    .where(eq(channels.agentId, agentId));
  return { deleted: true };
}

export async function createChannel(businessId: string, input: unknown) {
  const parsed = createChannelInputSchema.parse(input);
  await assertSoleLiveOwner(businessId, parsed.platform, parsed.platformChannelId);
  await assertAgentIsOwned(businessId, parsed.agentId);

  // A channel without an agent is a Page that goes quiet on its owner, so the store's default
  // agent is attached here rather than left to whoever remembered to pick one.
  const agentId = parsed.agentId ?? (await ensureDefaultAgent(businessId)).id;

  // Check if a channel (active or soft-deleted) already exists for this business/platform channel
  const existing = await findChannelByBusinessPlatformChannelId(
    businessId,
    parsed.platform,
    parsed.platformChannelId,
  );

  if (existing) {
    // Reactivate and update the existing channel row
    const [updated] = await db
      .update(channels)
      .set({
        deletedAt: null,
        apiToken: parsed.apiToken,
        agentId,
        extraInfo: parsed.extraInfo ?? null,
      })
      .where(eq(channels.id, existing.id))
      .returning();
    return { id: updated.id, status: 'linked' as const };
  }

  const [channel] = await db
    .insert(channels)
    .values({ ...parsed, agentId, businessId })
    .returning();
  return { id: channel.id, status: 'linked' as const };
}

export async function getChannelByPageId(pageId: string) {
  return db.query.channels.findFirst({
    where: and(eq(channels.platform, 'facebook'), eq(channels.platformChannelId, pageId), isNull(channels.deletedAt)),
    with: { agent: true, business: true },
  });
}

export async function getChannelByBusinessPlatformChannelId(
  businessId: string,
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter',
  platformChannelId: string,
) {
  return db.query.channels.findFirst({
    where: and(
      eq(channels.businessId, businessId),
      eq(channels.platform, platform),
      eq(channels.platformChannelId, platformChannelId),
      isNull(channels.deletedAt),
    ),
  });
}

/**
 * Which store, if any, currently holds a live channel for this platform account. The caller
 * compares the answer against its own business and never sees the other one's identity — a page
 * being taken is information a store needs; who took it is not theirs.
 */
export async function getLiveChannelOwnerBusinessId(
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter',
  platformChannelId: string,
): Promise<string | null> {
  const row = await db.query.channels.findFirst({
    where: and(
      eq(channels.platform, platform),
      eq(channels.platformChannelId, platformChannelId),
      isNull(channels.deletedAt),
    ),
    columns: { businessId: true },
  });
  return row?.businessId ?? null;
}

/** Includes soft-deleted rows — used to restore a previously removed channel on reconnect. */
export async function findChannelByBusinessPlatformChannelId(
  businessId: string,
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter',
  platformChannelId: string,
) {
  return db.query.channels.findFirst({
    where: and(
      eq(channels.businessId, businessId),
      eq(channels.platform, platform),
      eq(channels.platformChannelId, platformChannelId),
    ),
  });
}

export async function getChannelById(channelId: string) {
  return db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), isNull(channels.deletedAt)),
    with: { agent: true },
  });
}

export async function listChannels(businessId: string) {
  return db.query.channels.findMany({
    where: and(eq(channels.businessId, businessId), isNull(channels.deletedAt)),
    with: { agent: true },
  });
}

export async function updateChannelAgent(channelId: string, businessId: string, agentId: string | null) {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId), isNull(channels.deletedAt)),
  });
  if (!channel) return null;
  await assertAgentIsOwned(businessId, agentId);

  await db.update(channels).set({ agentId }).where(eq(channels.id, channelId));
  return { success: true };
}

export async function updateChannel(businessId: string, channelId: string, input: unknown) {
  const parsed = updateChannelInputSchema.parse(input);
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId), isNull(channels.deletedAt)),
  });
  if (!channel) return null;
  if (parsed.platformChannelId || parsed.platform) {
    await assertSoleLiveOwner(
      businessId,
      parsed.platform ?? channel.platform,
      parsed.platformChannelId ?? channel.platformChannelId,
    );
  }
  await assertAgentIsOwned(businessId, parsed.agentId);
  const [updated] = await db
    .update(channels)
    .set(parsed)
    .where(eq(channels.id, channelId))
    .returning();
  return { id: updated.id, updated: true };
}

/** Restores a soft-deleted channel and refreshes its credentials/metadata. */
export async function reactivateChannel(businessId: string, channelId: string, input: unknown) {
  const parsed = updateChannelInputSchema.parse(input);
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId)),
  });
  if (!channel) return null;
  await assertSoleLiveOwner(
    businessId,
    parsed.platform ?? channel.platform,
    parsed.platformChannelId ?? channel.platformChannelId,
  );
  await assertAgentIsOwned(businessId, parsed.agentId);
  const [updated] = await db
    .update(channels)
    .set({ ...parsed, deletedAt: null })
    .where(eq(channels.id, channelId))
    .returning();
  return { id: updated.id, updated: true };
}

export async function deleteChannel(businessId: string, channelId: string) {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId), isNull(channels.deletedAt)),
  });
  if (!channel) return null;
  await db
    .update(channels)
    .set({ deletedAt: new Date() })
    .where(eq(channels.id, channelId));
  return { deleted: true };
}

/**
 * A platform channel connected from the admin console: owned by the operator, answering no
 * customers. Reconnecting refreshes its token; a page held by a store is refused.
 */
export async function upsertAdminChannel(input: {
  platformChannelId: string;
  apiToken: string;
  pageName: string;
}): Promise<{ id: string; created: boolean }> {
  const live = await db.query.channels.findFirst({
    where: and(
      eq(channels.platform, 'facebook'),
      eq(channels.platformChannelId, input.platformChannelId),
      isNull(channels.deletedAt),
    ),
  });
  if (live) {
    if (!live.isAdminOnly) throw new ChannelTakenError();
    await db
      .update(channels)
      .set({
        apiToken: input.apiToken,
        extraInfo: JSON.stringify({ pageName: input.pageName }),
      })
      .where(eq(channels.id, live.id));
    return { id: live.id, created: false };
  }

  const removed = await db.query.channels.findFirst({
    where: and(
      eq(channels.platform, 'facebook'),
      eq(channels.platformChannelId, input.platformChannelId),
      isNotNull(channels.deletedAt),
    ),
  });
  if (removed) {
    const [restored] = await db
      .update(channels)
      .set({
        deletedAt: null,
        businessId: null,
        agentId: null,
        isAdminOnly: true,
        apiToken: input.apiToken,
        extraInfo: JSON.stringify({ pageName: input.pageName }),
      })
      .where(eq(channels.id, removed.id))
      .returning({ id: channels.id });
    return { id: restored.id, created: true };
  }

  const [created] = await db
    .insert(channels)
    .values({
      platform: 'facebook',
      apiToken: input.apiToken,
      platformChannelId: input.platformChannelId,
      extraInfo: JSON.stringify({ pageName: input.pageName }),
      isAdminOnly: true,
    })
    .returning({ id: channels.id });
  return { id: created.id, created: true };
}

export async function listAdminChannels() {
  return db.query.channels.findMany({
    where: and(eq(channels.isAdminOnly, true), isNull(channels.deletedAt)),
    orderBy: [asc(channels.createdAt)],
  });
}

/** Who holds a live channel for this page, and whether that holder is the operator. */
export async function getLiveChannelOwner(
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter',
  platformChannelId: string,
) {
  return (
    (await db.query.channels.findFirst({
      where: and(
        eq(channels.platform, platform),
        eq(channels.platformChannelId, platformChannelId),
        isNull(channels.deletedAt),
      ),
      columns: { businessId: true, isAdminOnly: true },
    })) ?? null
  );
}
