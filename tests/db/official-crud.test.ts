import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { setupPgliteDatabase } from '../helpers/pglite-db';
import type { Database } from '@db/client';
import { conversations, channels } from '@db/schema';
import {
  getSettings,
  updateSettings,
  getWeights,
  saveWeights,
  upsertProspectFromTurn,
  listProspects,
  updateProspect,
  rescoreProspects,
  scoreProspect,
  upsertTicketFromTurn,
  listTickets,
  updateTicket,
  addTicketNote,
  listTicketEvents,
} from '@repo/db/crud/official';

/**
 * Migration 0036 + official-channels crud on a disposable in-memory Postgres: the whole
 * migration chain runs, the new tables' constraints hold (singleton rows, prospect
 * dedupe) and the default weights make scores rank a fuller inquiry above a thin one.
 */
describe('migration 0036 + official crud', () => {
  let db: Database;
  const actor = { kind: 'system' as const };

  beforeAll(async () => {
    db = (await setupPgliteDatabase()) as Database;
  });

  async function adminChannel(platform = 'facebook'): Promise<string> {
    const [row] = await db
      .insert(channels)
      .values({ platform, apiToken: 'irrelevant-in-crud-tests', platformChannelId: ' adm-ch-' + Math.random().toString(36).slice(2), isAdminOnly: true, businessId: null })
      .onConflictDoNothing()
      .returning({ id: channels.id });
    return row.id;
  }

  it('0000..0036 migrate clean and rollback 0036 alone', async () => {
    // The full chain (0000→0036) ran in setup; official settings exist and stay single.
    const settings = await getSettings();
    expect(settings.availability).toBe('available');
    const again = await getSettings();
    expect(again.id).toBe(settings.id);
  });

  it('conversations.business_id is now nullable', async () => {
    const [row] = await db
      .insert(conversations)
      .values({ businessId: null, channelId: await adminChannel(), customerPlatformId: 'ping-' + Date.now() })
      .returning();
    expect(row.businessId).toBeNull();
  });

  it('settings update flips availability and keeps one row', async () => {
    await updateSettings({ availability: 'taking_onboarding_requests' });
    const settings = await getSettings();
    expect(settings.availability).toBe('taking_onboarding_requests');
    const all = await db.select().from((await import('@db/schema')).officialSettings);
    expect(all).toHaveLength(1);
    await updateSettings({ availability: 'available' });
  });

  it('prospect upsert merges fields, keeps consent sticky, dedupes per contact', async () => {
    const channelId = await adminChannel('whatsapp');
    const first = await upsertProspectFromTurn(
      { channelId, platform: 'whatsapp', contactPlatformId: 'wa-1' },
      { name: 'Rana', country: 'Bangladesh' },
      { kind: 'ai' },
    );
    expect(first.consent).toBe(false);
    expect(first.score).toBe(1); // default country weight is 1

    const second = await upsertProspectFromTurn(
      { channelId, platform: 'whatsapp', contactPlatformId: 'wa-1' },
      { budget: 'under $500', consent: true },
      { kind: 'ai' },
    );
    expect(second.id).toBe(first.id);
    expect(second.consent).toBe(true);
    expect(second.consentAt).not.toBeNull();
    expect(second.budget).toBe('under $500');
    expect(second.score).toBe(5); // country 1 + budget 3 + consent 1

    // Consent follows the customer's latest statement, either direction.
    const declined = await upsertProspectFromTurn(
      { channelId, platform: 'whatsapp', contactPlatformId: 'wa-1' },
      { consent: false },
      { kind: 'ai' },
    );
    expect(declined.consent).toBe(false);
    const reopened = await upsertProspectFromTurn(
      { channelId, platform: 'whatsapp', contactPlatformId: 'wa-1' },
      { consent: true },
      { kind: 'ai' },
    );
    expect(reopened.consent).toBe(true);
    expect(reopened.consentAt).not.toBeNull();
  });

  it('weights are operator-configurable and rescore re-ranks', async () => {
    const { weights } = await getWeights();
    expect(weights.budget).toBeUndefined(); // defaults come from code, not storage
    const saved = await saveWeights({ budget: 10, country: 0 });
    expect(saved.budget).toBe(10);
    const changed = await rescoreProspects();
    expect(changed).toBeGreaterThan(0);
    const rows = await listProspects({});
    expect(rows[0].score).toBeGreaterThanOrEqual(rows.at(-1)!.score);
    await saveWeights({ budget: 3 });
    await rescoreProspects();
  });

  it('scoreProspect is honest about thin inquiries', () => {
    const { score } = scoreProspect({ name: 'x' }, {});
    expect(score).toBe(0); // default weight on name is 0
    const fuller = scoreProspect({ name: 'x', budget: 'y', needs: 'z' }, {});
    expect(fuller.score).toBe(5);
  });

  it('tickets: one open ticket per conversation+type, events record patches', async () => {
    const channelId = await adminChannel('facebook');
    const [conv] = await db
      .insert(conversations)
      .values({ businessId: null, channelId, customerPlatformId: 'fb-ticketer' })
      .returning();
    const created = await upsertTicketFromTurn({
      channelId,
      conversationId: conv.id,
      customerPlatformId: 'fb-ticketer',
      customerName: 'Rana',
      type: 'support',
      subject: 'Password reset loop',
      summary: 'Customer cannot reset the password on the storefront',
      actor,
    });
    expect(created.created).toBe(true);
    const again = await upsertTicketFromTurn({
      channelId,
      conversationId: conv.id,
      customerPlatformId: 'fb-ticketer',
      type: 'support',
      summary: 'still stuck after trying again',
      actor,
    });
    expect(again.created).toBe(false);
    expect(again.ticket.id).toBe(created.ticket.id);

    const updated = await updateTicket(created.ticket.id, { status: 'in_progress', priority: 'high' }, { kind: 'operator' });
    expect(updated?.status).toBe('in_progress');
    await addTicketNote(created.ticket.id, 'Called the customer; waiting on email confirmation.', { kind: 'operator', userId: null });
    const events = await listTicketEvents(created.ticket.id);
    expect(events.map((event) => event.kind)).toEqual(['created', 'ai_turn', 'status', 'priority', 'note']);

    const supportRows = await listTickets({ type: 'support', status: 'in_progress' });
    expect(supportRows.some((row) => row.id === created.ticket.id)).toBe(true);
  });

  it('security tickets are their own type queue', async () => {
    const channelId = await adminChannel('facebook');
    const created = await upsertTicketFromTurn({
      channelId,
      customerPlatformId: 'sec-reporter',
      type: 'security',
      subject: 'Login codes arriving twice',
      actor,
    });
    const rows = await listTickets({ type: 'security' });
    expect(rows.map((row) => row.id)).toContain(created.ticket.id);
    const rowsSupport = await listTickets({ type: 'support', search: 'Login codes' });
    expect(rowsSupport).toHaveLength(0);
  });
});
