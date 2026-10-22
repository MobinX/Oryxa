import { describe, it, expect, beforeAll } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import { createAgent, createChannel } from '@repo/db/crud/channel';
import {
  upsertLeadFromTurn,
  getLeadById,
  listLeads,
  updateLead,
  deleteLead,
  findLeadId,
  setLeadConsent,
  listLeadEvents,
  getCapacity,
  updateCapacity,
  capacityIsOpen,
  reserveCapacitySlot,
  releaseCapacitySlot,
  listActiveReservations,
} from '@repo/db/crud/lead';
import {
  resolveChannelAiConfig,
  saveChannelAiConfig,
  saveBusinessProfile,
  getBusinessProfile,
  listKnowledgeEntries,
  listActiveKnowledge,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from '@repo/db/crud/ai-config';

withPglite();

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seedWorld() {
  const sfx = suffix();
  const user = await syncUser({
    firebaseUid: `crud-${sfx}`,
    name: 'Crud Test',
    email: `crud-${sfx}@oryxa.dev`,
    signInMethod: 'google',
  });
  const business = await createBusiness(user.id, {
    name: `CRUD Store ${sfx}`,
    description: 'crud fixture',
    hasTradeLicense: false,
    hasTaxLicense: false,
  });
  const agent = await createAgent(business.id, {
    name: 'CRUD Bot',
    systemPrompt: 'test',
    platformType: 'facebook',
  });
  const channel = await createChannel(business.id, {
    platform: 'facebook',
    apiToken: 't',
    platformChannelId: `CH_${sfx}`,
    agentId: agent.id,
  });
  return { business, agent, channel };
}

describe('ai-config crud', () => {
  it('resolve: absent row yields the schema defaults, save writes and re-writes one row', async () => {

    const { channel } = await seedWorld();

    const defaults = await resolveChannelAiConfig(channel.id);
    expect([defaults.aiEnabled, defaults.autoReply, defaults.confidenceThreshold, defaults.tone]).toEqual([
      true,
      true,
      '0.60',
      'friendly',
    ]);

    const first = await saveChannelAiConfig(channel.id, {
      channelId: channel.id,
      aiEnabled: true,
      confidenceThreshold: 0.85,
      tone: 'professional',
      language: 'en',
      maxReplyLength: 500,
      leadQuestions: ['What do you need?'],
    });
    expect(first?.channelId).toBe(channel.id);
    expect(first?.confidenceThreshold).toBe('0.85');

    const second = await saveChannelAiConfig(channel.id, { channelId: channel.id, aiEnabled: true, tone: 'concise' });
    expect(second?.tone).toBe('concise');

    const rows = await (async () => {
      const { db } = await import('@db/client');
      const { channelAiConfigs } = await import('@db/schema');
      const { eq } = await import('drizzle-orm');
      return db.query.channelAiConfigs.findMany({ where: eq(channelAiConfigs.channelId, channel.id) });
    })();
    expect(rows).toHaveLength(1);
  });

  it('profile round-trips; knowledge honors active flag and soft delete', async () => {

    const { business } = await seedWorld();

    const profile = await saveBusinessProfile(business.id, {
      displayName: 'OnlyOrders Tea Co.',
      description: 'Loose-leaf tea subscription.',
      contacts: '+880 1712-000000',
    });
    expect(getBusinessProfile(business.id)).resolves.toMatchObject({ displayName: 'OnlyOrders Tea Co.' });

    const created = await createKnowledgeEntry(business.id, {
      question: 'Do you deliver outside Dhaka?',
      answer: 'Yes — nationwide in 3-5 days.',
      active: true,
    });
    await createKnowledgeEntry(business.id, {
      question: 'Inactive question',
      answer: 'kept, hidden',
      active: false,
    });

    expect((await listKnowledgeEntries(business.id)).map((r) => r.active)).toContain(false);
    const active = await listActiveKnowledge(business.id);
    expect(active).toHaveLength(1);
    expect(active[0].question).toContain('Dhaka');

    await updateKnowledgeEntry(business.id, created.id, { active: false });
    expect(await listActiveKnowledge(business.id)).toHaveLength(0);

    await deleteKnowledgeEntry(business.id, created.id);
    expect((await listKnowledgeEntries(business.id)).length).toBe(1);
    expect(profile).toBeTruthy();
  });
});

describe('lead crud', () => {
  it('upsert dedupes on (channelId, platformUserId) and only fills empty fields', async () => {

    const { business, channel } = await seedWorld();
    void business;

    const identity = {
      businessId: business.id,
      channelId: channel.id,
      platform: 'whatsapp',
      platformUserId: 'WA_USER_1',
    };
    const first = await upsertLeadFromTurn(identity, { name: 'Rina', phone: '+880 1712 111 222' });
    expect(first.name).toBe('Rina');

    const again = await upsertLeadFromTurn(identity, { name: 'Different Name', email: 'rina@example.com' });
    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Rina'); // never overwritten
    expect(again.email).toBe('rina@example.com');
    expect(await findLeadId(channel.id, 'WA_USER_1')).toBe(first.id);
  });

  it('status, consent and deletion behave through their events', async () => {

    const { business, channel } = await seedWorld();

    const lead = await upsertLeadFromTurn({
      businessId: business.id,
      channelId: channel.id,
      platform: 'whatsapp',
      platformUserId: 'WA_USER_2',
    });

    await setLeadConsent(lead.id, true);
    const opted = await getLeadById(business.id, lead.id);
    expect(opted?.consent).toBe(true);

    const updated = await updateLead(lead.id, { status: 'qualified', notes: 'Wants 50 units' }, { kind: 'operator' }, business.id);
    expect(updated?.status).toBe('qualified');

    const found = await listLeads({ businessId: business.id, status: 'qualified' });
    expect(found.map((r) => r.id)).toContain(lead.id);

    const scrubbed = await deleteLead(business.id, lead.id);
    expect(scrubbed?.deleted).toBe(true);
    const events = await listLeadEvents(lead.id);
    expect(events.some((e) => e.kind === 'deleted')).toBe(true);
    expect(await getLeadById(business.id, lead.id)).toBeNull();
  });
});

describe('capacity', () => {
  it('closed or empty means no claim and no reservation', async () => {

    const { business } = await seedWorld();

    const row = await updateCapacity(business.id, {
      businessId: business.id,
      acceptingNewCustomers: true,
      maxCapacity: 5,
      availableCapacity: 0,
      waitlistMode: 'auto',
    });
    expect(capacityIsOpen(row)).toBe(false);
    expect((await reserveCapacitySlot(business.id)).reserved).toBe(false);

    const closed = await updateCapacity(business.id, {
      businessId: business.id,
      acceptingNewCustomers: false,
      maxCapacity: 5,
      availableCapacity: 3,
      waitlistMode: 'off',
    });
    expect(closed.acceptingNewCustomers).toBe(false);
    expect((await reserveCapacitySlot(business.id)).reserved).toBe(false);
  });

  it('one slot is reserved exactly once, and release restores it (never above max)', async () => {

    const { business } = await seedWorld();

    await updateCapacity(business.id, {
      businessId: business.id,
      acceptingNewCustomers: true,
      maxCapacity: 2,
      availableCapacity: 2,
      waitlistMode: 'manual',
      fullCapacityMessage: 'We are full — join the waitlist?',
    });

    const first = await reserveCapacitySlot(business.id);
    expect(first.reserved).toBe(true);
    const second = await reserveCapacitySlot(business.id);
    expect(second.reserved).toBe(true);
    const third = await reserveCapacitySlot(business.id);
    expect(third.reserved).toBe(false); // the atomic claim is the story
    expect((await listActiveReservations(business.id)).length).toBe(2);

    const afterFirstReserve = await getCapacity(business.id);
    expect(afterFirstReserve.availableCapacity).toBe(0);

    const reservations = await listActiveReservations(business.id);
    const released = await releaseCapacitySlot(business.id, reservations[0].id);
    expect(released.released).toBe(true);
    await releaseCapacitySlot(business.id, reservations[1].id);

    const freed = await getCapacity(business.id);
    expect(freed.availableCapacity).toBe(2);

    // A double release can only lift the counter back to its ceiling, not past it.
    await releaseCapacitySlot(business.id, reservations[0].id);
    await releaseCapacitySlot(business.id, reservations[1].id);
    expect((await getCapacity(business.id)).availableCapacity).toBe(2);
  });
});
