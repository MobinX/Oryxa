import { eq, and } from 'drizzle-orm';
import { db } from '@db/client';
import { agents, channels } from '@db/schema';
import { createAgentInputSchema, createChannelInputSchema } from '@repo/shared';

export async function createAgent(businessId: string, input: unknown) {
  const parsed = createAgentInputSchema.parse(input);
  const [agent] = await db
    .insert(agents)
    .values({ ...parsed, businessId })
    .returning();
  return agent;
}

export async function listAgents(businessId: string) {
  return db.query.agents.findMany({
    where: eq(agents.businessId, businessId),
  });
}

export async function createChannel(businessId: string, input: unknown) {
  const parsed = createChannelInputSchema.parse(input);
  const [channel] = await db
    .insert(channels)
    .values({ ...parsed, businessId })
    .returning();
  return { id: channel.id, status: 'linked' as const };
}

export async function getChannelByPageId(pageId: string) {
  return db.query.channels.findFirst({
    where: and(eq(channels.platform, 'facebook'), eq(channels.platformChannelId, pageId)),
    with: { agent: true, business: true },
  });
}

export async function listChannels(businessId: string) {
  return db.query.channels.findMany({
    where: eq(channels.businessId, businessId),
    with: { agent: true },
  });
}

export async function updateChannelAgent(channelId: string, businessId: string, agentId: string | null) {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.businessId, businessId)),
  });
  if (!channel) return null;

  await db.update(channels).set({ agentId }).where(eq(channels.id, channelId));
  return { success: true };
}

export async function getChannelById(channelId: string) {
  return db.query.channels.findFirst({
    where: eq(channels.id, channelId),
    with: { agent: true },
  });
}
