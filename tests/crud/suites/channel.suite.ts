import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import { db } from '@db/client';
import { channels } from '@db/schema';
import {
  createAgent,
  listAgents,
  createChannel,
  listChannels,
  getChannelByPageId,
  updateChannelAgent,
  getChannelById,
  deleteChannel,
  reactivateChannel,
  ChannelTakenError,
  ChannelAgentError,
} from '@repo/db/crud/channel';

export function registerChannelCrudTests() {
  it('createAgent and listAgents', async () => {
    const { business } = await seedTestWorld();
    const agent = await createAgent(business.id, {
      name: 'Helper',
      systemPrompt: 'Be nice',
      platformType: 'facebook',
    });
    const agents = await listAgents(business.id);
    expect(agents.some((a) => a.id === agent.id)).toBe(true);
  });

  it('createChannel links page', async () => {
    const { business } = await seedTestWorld();
    const channel = await createChannel(business.id, {
      platform: 'facebook',
      apiToken: 'tok',
      platformChannelId: `PAGE_NEW_${Date.now()}`,
    });
    expect(channel.status).toBe('linked');
  });

  it('getChannelByPageId finds channel', async () => {
    const seed = await seedTestWorld();
    const found = await getChannelByPageId(seed.pageChannelId);
    expect(found?.id).toBe(seed.channel.id);
  });

  it('listChannels returns channels', async () => {
    const { business, channel } = await seedTestWorld();
    const channels = await listChannels(business.id);
    expect(channels.some((c) => c.id === channel.id)).toBe(true);
  });

  it('updateChannelAgent binds agent', async () => {
    const seed = await seedTestWorld();
    const agent2 = await createAgent(seed.business.id, {
      name: 'Agent 2',
      systemPrompt: 'Prompt',
      platformType: 'facebook',
    });
    const result = await updateChannelAgent(seed.channel.id, seed.business.id, agent2.id);
    expect(result?.success).toBe(true);
    const ch = await getChannelById(seed.channel.id);
    expect(ch?.agentId).toBe(agent2.id);
  });

  it('updateChannelAgent can disable agent', async () => {
    const seed = await seedTestWorld();
    await updateChannelAgent(seed.channel.id, seed.business.id, null);
    const ch = await getChannelById(seed.channel.id);
    expect(ch?.agentId).toBeNull();
  });

  it('refuses a page another business already holds live', async () => {
    const taken = await seedTestWorld();
    const other = await seedTestWorld();
    await expect(
      createChannel(other.business.id, {
        platform: 'facebook',
        apiToken: 'tok',
        platformChannelId: taken.pageChannelId,
      }),
    ).rejects.toThrow(ChannelTakenError);
    expect((await getChannelByPageId(taken.pageChannelId))?.id).toBe(taken.channel.id);
  });

  it('lets a business re-link the page it already holds', async () => {
    const seed = await seedTestWorld();
    const again = await createChannel(seed.business.id, {
      platform: 'facebook',
      apiToken: 'refreshed-token',
      platformChannelId: seed.pageChannelId,
    });
    expect(again.id).toBe(seed.channel.id);
  });

  it('the index itself refuses a second live owner, helper checks aside', async () => {
    const a = await seedTestWorld();
    const b = await seedTestWorld();
    // A raw insert goes around assertSoleLiveOwner, so a pass here is channels_platform_channel_live_idx
    // doing the work — the guarantee the migration is supposed to provide.
    await expect(
      db.insert(channels).values({
        businessId: b.business.id,
        platform: 'facebook',
        apiToken: 'tok',
        platformChannelId: a.pageChannelId,
      }),
    ).rejects.toThrow(/channels_platform_channel_live_idx/);
  });

  it('a page moves only by being released first, restore paths included', async () => {
    const a = await seedTestWorld();
    const b = await seedTestWorld();

    await deleteChannel(a.business.id, a.channel.id);
    const handed = await createChannel(b.business.id, {
      platform: 'facebook',
      apiToken: 'tok-b',
      platformChannelId: a.pageChannelId,
    });
    expect((await getChannelByPageId(a.pageChannelId))?.id).toBe(handed.id);

    // A still holds a soft-deleted row for the same page. Neither path may bring it back while
    // B holds the page live — reviving it is exactly how one store ended up answering another
    // store's customers, because the webhook picks a single row for a page id.
    await expect(
      createChannel(a.business.id, {
        platform: 'facebook',
        apiToken: 'tok-a2',
        platformChannelId: a.pageChannelId,
      }),
    ).rejects.toThrow(ChannelTakenError);
    await expect(
      reactivateChannel(a.business.id, a.channel.id, { apiToken: 'tok-a2' }),
    ).rejects.toThrow(ChannelTakenError);
  });

  it('will not point a channel at another store\'s agent, on any write path', async () => {
    const a = await seedTestWorld();
    const b = await seedTestWorld();

    await expect(
      createChannel(a.business.id, {
        platform: 'facebook',
        apiToken: 'tok-new',
        platformChannelId: `PAGE_${crypto.randomUUID()}`,
        agentId: b.agent.id,
      }),
    ).rejects.toThrow(ChannelAgentError);
    await expect(
      updateChannelAgent(a.channel.id, a.business.id, b.agent.id),
    ).rejects.toThrow(ChannelAgentError);

    // The channel the attacker aimed at is untouched: still answering with its own agent.
    expect((await getChannelById(a.channel.id))?.agentId).toBe(a.agent.id);
  });
}
