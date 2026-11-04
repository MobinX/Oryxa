import { describe, it, expect, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { db } from '@db/client';
import { notifications } from '@db/schema';
import { and, eq } from 'drizzle-orm';
import {
  createBusinessNotification,
  setMessengerNoticeHandler,
  type MessengerDelivery,
} from '@repo/db/crud/notification';

/**
 * A notice is stored whether or not Messenger delivers it, and that used to be invisible: Meta
 * refuses a send outside the messaging window and the merchant simply never learned. These pin the
 * outcome onto the stored row, which is the whole point of the columns.
 */
/**
 * The send is deliberately fire-and-forget, so the outcome lands a moment after the insert. Poll
 * for the row by title — the notice is created with a unique title per case.
 */
async function readNotice(businessId: string, title: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.businessId, businessId), eq(notifications.title, title)));
    if (row?.messengerStatus) return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.businessId, businessId), eq(notifications.title, title)));
  return row;
}

describe('business notification Messenger outcome', () => {
  withPglite({ timeoutMs: 120_000 });
  afterEach(() => setMessengerNoticeHandler(null));

  it('records a refusal instead of pretending the merchant was told', async () => {
    const seed = await seedTestWorld();
    const report: MessengerDelivery = {
      status: 'failed',
      recipients: 2,
      delivered: 0,
      detail: '2 of 2 account(s): Facebook only allows a reply within 24 hours of the last message.',
    };
    setMessengerNoticeHandler(async () => report);

    await createBusinessNotification({
      businessId: seed.business.id,
      kind: 'human_help',
      title: 'The agent needs a human',
      body: 'A customer asked something the agent could not answer.',
    });

    const row = await readNotice(seed.business.id, 'The agent needs a human');
    expect(row?.messengerStatus).toBe('failed');
    expect(row?.messengerRecipients).toBe(2);
    expect(row?.messengerDelivered).toBe(0);
    expect(row?.messengerDetail).toContain('24 hours');
  });

  it('records success, and a throw still lands as a failure', async () => {
    const seed = await seedTestWorld();
    setMessengerNoticeHandler(async () => ({
      status: 'delivered',
      recipients: 1,
      delivered: 1,
      detail: null,
    }));
    await createBusinessNotification({
      businessId: seed.business.id,
      kind: 'order_placed',
      title: 'New order received',
      body: '1 × Test T-Shirt.',
    });
    const delivered = await readNotice(seed.business.id, 'New order received');
    expect(delivered?.messengerStatus).toBe('delivered');
    expect(delivered?.messengerDetail).toBeNull();

    setMessengerNoticeHandler(async () => {
      throw new Error('page token rejected');
    });
    await createBusinessNotification({
      businessId: seed.business.id,
      kind: 'order_placed',
      title: 'Second order received',
      body: '2 × Test T-Shirt.',
    });
    const failed = await readNotice(seed.business.id, 'Second order received');
    expect(failed?.messengerStatus).toBe('failed');
    expect(failed?.messengerDetail).toContain('page token rejected');
  });

  it('leaves the outcome unset when nobody registered a sender', async () => {
    const seed = await seedTestWorld();
    setMessengerNoticeHandler(null);
    await createBusinessNotification({
      businessId: seed.business.id,
      kind: 'order_placed',
      title: 'Unpushed order',
      body: 'Nothing was sent.',
    });
    const [row] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.businessId, seed.business.id), eq(notifications.title, 'Unpushed order')));
    expect(row?.messengerStatus).toBeNull();
  });
});
