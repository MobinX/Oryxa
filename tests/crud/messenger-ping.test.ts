import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { db } from '@db/client';
import { messengerNotificationUsers } from '@db/schema';
import { eq } from 'drizzle-orm';
import { createBusiness } from '@repo/db/crud/business';
import { createChannel } from '@repo/db/crud/channel';
import {
  MESSENGER_WINDOW_DAYS,
  getMessengerNotificationOverview,
  nextPingDeadlineAt,
  recordMessengerNotificationPing,
  upsertMessengerNotificationUser,
} from '@repo/db/crud/messenger-notification';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Meta opens a messaging window for seven days from the last message the PERSON sent, per page.
 * A merchant who links an account and never writes back therefore stops receiving order and
 * human-help alerts with no signal at either end. PING is the handshake that keeps it alive.
 */
describe('notification ping window', () => {
  withPglite({ timeoutMs: 120_000 });

  it('renews every store this account follows on that page, one window out', async () => {
    const seed = await seedTestWorld();
    const second = await createBusiness(seed.user.id, {
      name: 'Second Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const psid = `psid-all-${Date.now()}`;
    await upsertMessengerNotificationUser({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      platformUserId: psid,
    });
    await upsertMessengerNotificationUser({
      businessId: second.id,
      channelId: seed.channel.id,
      platformUserId: psid,
    });

    const at = new Date('2026-11-02T10:00:00.000Z');
    const renewed = await recordMessengerNotificationPing({
      channelId: seed.channel.id,
      platformUserId: psid,
      at,
    });

    expect(renewed?.renewed).toBe(2);
    expect(renewed?.deadlineAt.toISOString()).toBe('2026-11-09T10:00:00.000Z');
    expect(renewed?.deadlineAt.getTime() - at.getTime()).toBe(MESSENGER_WINDOW_DAYS * DAY_MS);

    const rows = await db
      .select({ pinged: messengerNotificationUsers.lastPingAt })
      .from(messengerNotificationUsers)
      .where(eq(messengerNotificationUsers.platformUserId, psid));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.pinged?.toISOString() === at.toISOString())).toBe(true);
  });

  it('leaves the same person alone on another page, because each page counts separately', async () => {
    const seed = await seedTestWorld();
    const other = await createBusiness(seed.user.id, {
      name: 'Other Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const otherChannel = await createChannel(other.id, {
      platform: 'facebook',
      apiToken: 'tok',
      platformChannelId: `PAGE_B_${Date.now()}`,
    });
    const psid = `psid-split-${Date.now()}`;
    await upsertMessengerNotificationUser({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      platformUserId: psid,
    });
    await upsertMessengerNotificationUser({
      businessId: other.id,
      channelId: otherChannel.id,
      platformUserId: psid,
    });

    const onFirstPage = await recordMessengerNotificationPing({
      channelId: seed.channel.id,
      platformUserId: psid,
    });
    expect(onFirstPage?.renewed).toBe(1);

    const onSecondPage = await recordMessengerNotificationPing({
      channelId: otherChannel.id,
      platformUserId: psid,
    });
    expect(onSecondPage?.renewed).toBe(1);
  });

  it('answers nothing for a sender who never connected on that page', async () => {
    const seed = await seedTestWorld();
    const stranger = await recordMessengerNotificationPing({
      channelId: seed.channel.id,
      platformUserId: `psid-stranger-${Date.now()}`,
    });
    expect(stranger).toBeNull();
  });

  it('counts the connecting message as the first ping, so the portal shows a real deadline', async () => {
    const seed = await seedTestWorld();
    const psid = `psid-connect-${Date.now()}`;
    const connectedAt = new Date('2026-11-02T12:00:00.000Z');
    await upsertMessengerNotificationUser({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      platformUserId: psid,
      lastPingAt: connectedAt,
    });

    const overview = await getMessengerNotificationOverview(seed.business.id);
    expect(overview.users[0]?.lastPingAt?.toISOString()).toBe(connectedAt.toISOString());
    expect(nextPingDeadlineAt(connectedAt).toISOString()).toBe('2026-11-09T12:00:00.000Z');
  });
});
