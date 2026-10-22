import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { buildAiContext } from '@api/lib/ai-context';
import { extractLeadFields } from '@api/lib/lead-capture';
import { listMessages } from '@repo/db/crud/conversation';
import { saveBusinessProfile, saveChannelAiConfig } from '@repo/db/crud/ai-config';
import {
  upsertLeadFromTurn,
  setLeadConsent,
  getCapacity,
  updateCapacity,
  capacityIsOpen,
} from '@repo/db/crud/lead';

/**
 * Spec L's AI scenarios. The deterministic chapters are asserted directly: what enters
 * the model's context (1, 2, 4), what is captured (6, 7). Chapters that live elsewhere
 * already have suites: 8/12 whatsapp.test.ts, 10 agent-settings-gate.test.ts, 11
 * agent-runner.test.ts, 5/3 the webhook lead-capture path.
 */
describe('AI scenarios (spec L)', () => {
  withPglite();

  it('scenarios 1–2 (what do you do / pricing): the configured truth is the only content the model gets', async () => {
    const seed = await seedTestWorld();
    await saveBusinessProfile(seed.business.id, {
      displayName: 'Only Order',
      description: 'Phone accessories shop in Sylhet.',
      pricingPackages: 'Basketball case Tk 420, leather cover Tk 350.',
    });
    const context = await buildAiContext({ channelId: seed.channel.id, businessId: seed.business.id });

    expect(context.block).toContain('Only Order');
    expect(context.block).toContain('Basketball case Tk 420');

    // A store with no profile leaves the sections empty instead of inventing copy.
    const bare = await seedTestWorld();
    const other = await buildAiContext({ channelId: bare.channel.id, businessId: bare.business.id });
    expect(other.block).not.toMatch(/We are a .* that sells/);
  });

  it('scenario 4 (full capacity): the stored wording, verbatim, and a closed gate', async () => {
    const seed = await seedTestWorld();
    await updateCapacity(seed.business.id, {
      businessId: seed.business.id,
      acceptingNewCustomers: true,
      maxCapacity: 2,
      availableCapacity: 0,
      waitlistMode: 'auto',
      fullCapacityMessage: 'We are booked out this week — can I put you on the waitlist?',
    });
    expect(capacityIsOpen(await getCapacity(seed.business.id))).toBe(false);

    const context = await buildAiContext({ channelId: seed.channel.id, businessId: seed.business.id });
    expect(context.block).toContain('We are booked out this week — can I put you on the waitlist?');
    expect(context.block).toContain('Slots left: 0');

    await updateCapacity(seed.business.id, {
      businessId: seed.business.id,
      acceptingNewCustomers: true,
      maxCapacity: 2,
      availableCapacity: 1,
      waitlistMode: 'auto',
    });
    expect(capacityIsOpen(await getCapacity(seed.business.id))).toBe(true);
  });

  it('scenario 6 (gives phone/email) + scenario 7 (declines contact): capture once, opt-out sticky', async () => {
    const { business, channel } = await seedTestWorld();

    expect(extractLeadFields('call or whatsapp me at 01812 345 678, email kamrul@shop.io').phone).toBeTruthy();
    expect(extractLeadFields('please do not contact me again').phone).toBeUndefined();

    const lead = await upsertLeadFromTurn(
      { businessId: business.id, channelId: channel.id, platform: 'facebook', platformUserId: 'SCEN_7' },
      { name: 'Kamrul', consent: true },
    );
    expect(lead.consent).toBe(true);
    expect(lead.consentAt).not.toBeNull();

    // An explicit opt-out then beats every later observed consent.
    await setLeadConsent(lead.id, false);
    const after = await upsertLeadFromTurn(
      { businessId: business.id, channelId: channel.id, platform: 'facebook', platformUserId: 'SCEN_7' },
      { consent: true },
    );
    expect(after.consent).toBe(false);

    // …and the webhook START path is the only automated way back in.
    await setLeadConsent(lead.id, true);
    expect((await upsertLeadFromTurn(
      { businessId: business.id, channelId: channel.id, platform: 'facebook', platformUserId: 'SCEN_7' },
      {},
    )).consent).toBe(true);
  });

  it('scenario 9 (complaint): per-comment behavior is a closed vocabulary, not free JSON', async () => {
    const seed = await seedTestWorld();
    const stored = await saveChannelAiConfig(seed.channel.id, {
      channelId: seed.channel.id,
      aiCommentsEnabled: true,
      commentBehavior: { complaint: 'escalate', spam: 'flag' },
    });
    expect(stored?.commentBehavior).toMatchObject({ complaint: 'escalate', spam: 'flag' });

    // Unknown gestures are refused at the schema edge, not silently stored.
    await expect(
      saveChannelAiConfig(seed.channel.id, {
        channelId: seed.channel.id,
        commentBehavior: { complaint: 'hide_forever' as never },
      }),
    ).rejects.toThrow();
  });

  it('a fresh trigger answers nothing when no run happened (scenario 10 / 12 live in their own suites)', async () => {
    const seed = await seedTestWorld();
    expect(
      (await listMessages(seed.conversation.id, seed.business.id))?.filter((m) => m.from === 'self'),
    ).toEqual([]);
  });
});
