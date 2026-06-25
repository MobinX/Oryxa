import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import {
  createAgent,
  listAgents,
  createChannel,
  listChannels,
  getChannelByPageId,
  updateChannelAgent,
  getChannelById,
} from '@repo/db/crud/channel';

describe('Channel & Agent CRUD', () => {
  withPglite();

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
      platformChannelId: 'PAGE_NEW',
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
});
