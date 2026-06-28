import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { agents, channels } from '@db/schema';
import {
  createAgentInputSchema,
  updateAgentInputSchema,
  createChannelInputSchema,
  updateChannelInputSchema,
} from '@repo/shared';

export async function createAgent(businessId: string, input: unknown) {
  const parsed = createAgentInputSchema.parse(input);
  const [agent] = await db
    .insert(agents)
    .values({ ...parsed, businessId })
    .returning();
  return agent;
}

export async function getAgentById(businessId: string, agentId: string) {
  return db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.businessId, businessId), isNull(agents.deletedAt)),
  });
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
  const [updated] = await db
    .update(agents)
    .set(parsed)
    .where(eq(agents.id, agentId))
    .returning();
  return { id: updated.id, updated: true };
}

export async function deleteAgent(businessId: string, agentId: string) {
  const agent = await getAgentById(businessId, agentId);
  if (!agent) return null;
  // Unbind any channels pointing at this agent first
  await db
    .update(channels)
    .set({ agentId: null })
    .where(eq(channels.agentId, agentId));
  await db
    .update(agents)
    .set({ deletedAt: new Date() })
    .where(eq(agents.id, agentId));
  return { deleted: true };
}

export async function createChannel(businessId: string, input: unknown) {
  const parsed = createChannelInputSchema.parse(input);

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
        agentId: parsed.agentId ?? null,
        extraInfo: parsed.extraInfo ?? null,
      })
      .where(eq(channels.id, existing.id))
      .returning();
    return { id: updated.id, status: 'linked' as const };
  }

  const [channel] = await db
    .insert(channels)
    .values({ ...parsed, businessId })
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

  await db.update(channels).set({ agentId }).where(eq(channels.id, channelId));
  return { success: true };
}

export async function updateChannel(businessId: string, channelId: string, input: unknown) {
  const parsed = updateChannelInputSchema.parse(input);
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId), isNull(channels.deletedAt)),
  });
  if (!channel) return null;
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
