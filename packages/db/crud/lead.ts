import { and, desc, eq, isNull, or, sql, asc } from 'drizzle-orm';
import { db } from '@db/client';
import { leads, leadEvents, capacity, capacityReservations } from '@db/schema';
import { createLeadSchema, updateLeadSchema, capacitySchema } from '@repo/shared';

/**
 * The leads CRM (spec D). One lead per (channel, platform user) — the dedupe key the spec
 * names — and every write lands a `lead_events` row, so the history an agent or an operator
 * produced can be replayed without trusting prose.
 */

export type LeadRow = typeof leads.$inferSelect;
export type LeadEventRow = typeof leadEvents.$inferSelect;

export type LeadCaptureInput = {
  businessId: string;
  channelId: string;
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter';
  platformUserId: string;
  conversationId?: string | null;
  commentThreadId?: string | null;
  sourceChannel?: string;
};

export async function recordLeadEvent(
  leadId: string,
  kind: string,
  actor: { kind: 'operator' | 'ai' | 'system'; userId?: string | null },
  data: Record<string, unknown> = {},
) {
  await db.insert(leadEvents).values({
    leadId,
    kind,
    actorKind: actor.kind,
    actorUserId: actor.userId ?? null,
    data,
  });
}

/**
 * Get-or-create the lead a customer turn belongs to, applying whatever that turn let us
 * learn (name/phone/email from the platform profile or typed text, interest, consent).
 * Never merges two identities: the unique key is the platform id, and a later phone number
 * only fills the field — it never links one lead to another by what they typed.
 */
export async function upsertLeadFromTurn(
  identity: LeadCaptureInput,
  observed: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    interest?: string | null;
    consent?: boolean;
  } = {},
): Promise<LeadRow> {
  const existing = await db.query.leads.findFirst({
    where: and(
      eq(leads.channelId, identity.channelId),
      eq(leads.platformUserId, identity.platformUserId),
      isNull(leads.deletedAt),
    ),
  });

  const parsed = createLeadSchema.parse(identity);

  if (existing) {
    const patch = observedFill(existing, observed);
    if (Object.keys(patch).length > 0) {
      const [updated] = await db
        .update(leads)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(leads.id, existing.id))
        .returning();
      await recordLeadEvent(existing.id, 'field_observed', { kind: 'ai' }, observed);
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(leads)
    .values({
      businessId: parsed.businessId!,
      channelId: parsed.channelId,
      platform: parsed.platform,
      platformUserId: parsed.platformUserId,
      conversationId: identity.conversationId ?? null,
      commentThreadId: identity.commentThreadId ?? null,
      sourceChannel: identity.sourceChannel ?? parsed.platform,
      conversationRef: identity.conversationId ?? identity.commentThreadId ?? null,
      status: 'new',
      ...observedFill(null, observed),
    })
    .onConflictDoNothing({ target: [leads.channelId, leads.platformUserId] })
    .returning();

  const winner =
    created ??
    (await db.query.leads.findFirst({
      where: and(eq(leads.channelId, identity.channelId), eq(leads.platformUserId, identity.platformUserId)),
    }));
  if (!winner) throw new Error('lead row vanished after a creation race');
  await recordLeadEvent(winner.id, 'created', { kind: 'system' }, {
    source: identity.sourceChannel ?? parsed.platform,
  });
  return winner;
}

/**
 * Later readings only ever fill empty fields — a name the customer already gave is never
 * overwritten by whatever the next turn observed, and consent is sticky.
 */
function observedFill(existing: LeadRow | null, observed: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  interest?: string | null;
  consent?: boolean;
}) {
  const patch: Record<string, unknown> = {};
  const fill = (column: 'name' | 'phone' | 'email' | 'interest', value: unknown) => {
    if (value && !(existing && existing[column])) patch[column] = value;
  };
  fill('name', observed.name);
  fill('phone', observed.phone);
  fill('email', observed.email);
  fill('interest', observed.interest);
  if (observed.consent && !(existing && existing.consent)) {
    patch.consent = true;
    patch.consentAt = new Date();
  }
  return patch;
}

export async function getLeadById(businessId: string, leadId: string): Promise<LeadRow | null> {
  return (
    (await db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.businessId, businessId), isNull(leads.deletedAt)),
    })) ?? null
  );
}

export type LeadFilters = {
  businessId?: string;
  status?: string;
  channelId?: string;
  platform?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listLeads(filters: LeadFilters) {
  const conditions = [isNull(leads.deletedAt)];
  if (filters.businessId) conditions.push(eq(leads.businessId, filters.businessId));
  if (filters.status) conditions.push(sql`${leads.status}::text = ${filters.status}`);
  if (filters.channelId) conditions.push(eq(leads.channelId, filters.channelId));
  if (filters.platform) conditions.push(sql`${leads.platform}::text = ${filters.platform}`);
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(
      or(
        sql`${leads.name} ilike ${q}`,
        sql`${leads.phone} ilike ${q}`,
        sql`${leads.email} ilike ${q}`,
        sql`${leads.requirements} ilike ${q}`,
      )!,
    );
  }
  return db.query.leads.findMany({
    where: and(...conditions),
    orderBy: [desc(leads.updatedAt)],
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  });
}

export async function updateLead(
  leadId: string,
  input: unknown,
  actor: { kind: 'operator' | 'ai' | 'system'; userId?: string | null },
  businessId?: string,
): Promise<LeadRow | null> {
  const parsed = updateLeadSchema.parse(input);
  const conditions = [eq(leads.id, leadId), isNull(leads.deletedAt)];
  if (businessId) conditions.push(eq(leads.businessId, businessId));
  const existing = await db.query.leads.findFirst({ where: and(...conditions) });
  if (!existing) return null;

  const patch = { ...parsed, updatedAt: new Date() } as Record<string, unknown>;
  if (parsed.consent === true && !existing.consent) patch.consentAt = new Date();

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(eq(leads.id, leadId))
    .returning();

  for (const [field, value] of Object.entries(parsed)) {
    if ((existing as Record<string, unknown>)[field] !== value) {
      const kind =
        field === 'status'
          ? 'status_change'
          : field === 'notes'
            ? 'note'
            : field === 'consent'
              ? 'consent'
              : 'field_update';
      await recordLeadEvent(leadId, kind, actor, {
        field,
        from: (existing as Record<string, unknown>)[field] ?? null,
        to: value ?? null,
      });
    }
  }
  return updated;
}

/** Soft delete only, like every other business record. */
export async function deleteLead(businessId: string, leadId: string) {
  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.businessId, businessId), isNull(leads.deletedAt)),
  });
  if (!existing) return null;
  await db
    .update(leads)
    .set({ deletedAt: new Date(), status: 'closed' })
    .where(eq(leads.id, leadId));
  await recordLeadEvent(leadId, 'deleted', { kind: 'operator' });
  return { deleted: true };
}

/** The lead a (channel, platform user) belongs to; null when the pair has none. */
export async function findLeadId(channelId: string, platformUserId: string): Promise<string | null> {
  const row = await db.query.leads.findFirst({
    where: and(eq(leads.channelId, channelId), eq(leads.platformUserId, platformUserId), isNull(leads.deletedAt)),
    columns: { id: true },
  });
  return row?.id ?? null;
}

/** STOP/START (spec J): consent is a single boolean plus the instant it was last set. */
export async function setLeadConsent(leadId: string, consent: boolean) {
  const [row] = await db
    .update(leads)
    .set({ consent, consentAt: consent ? new Date() : null, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning({ id: leads.id, consent: leads.consent });
  return row ?? null;
}

export async function listLeadEvents(leadId: string) {
  return db.query.leadEvents.findMany({
    where: eq(leadEvents.leadId, leadId),
    orderBy: [asc(leadEvents.createdAt)],
  });
}

export async function getLeadByPhone(businessId: string, phone: string): Promise<LeadRow | null> {
  return (
    (await db.query.leads.findFirst({
      where: and(eq(leads.businessId, businessId), eq(leads.phone, phone), isNull(leads.deletedAt)),
    })) ?? null
  );
}

/* ---- Capacity & waitlist (spec C) ---- */

export type CapacityRow = typeof capacity.$inferSelect;

export async function getCapacity(businessId: string): Promise<CapacityRow> {
  const existing = await db.query.capacity.findFirst({ where: eq(capacity.businessId, businessId) });
  if (existing) return existing;
  // A reader of a business that never saved capacity sees "no slots", not an error.
  const [created] = await db
    .insert(capacity)
    .values({ businessId, availableCapacity: 0, maxCapacity: 0 })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.capacity.findFirst({ where: eq(capacity.businessId, businessId) }))!;
}

export async function updateCapacity(businessId: string, input: unknown): Promise<CapacityRow> {
  await getCapacity(businessId);
  const parsed = capacitySchema.parse(input);
  const patch = { ...parsed, updatedAt: new Date() } as Record<string, unknown>;
  delete patch.businessId;
  const [updated] = await db
    .update(capacity)
    .set(patch)
    .where(eq(capacity.businessId, businessId))
    .returning();
  return updated;
}

/** Whether an availability claim may be made at all: open + a slot to give. */
export function capacityIsOpen(row: CapacityRow): boolean {
  return row.acceptingNewCustomers && row.availableCapacity > 0;
}

/**
 * One atomic conditional UPDATE per reservation. The neon-http driver cannot open a
 * transaction (see the quota_usage design note), so two concurrent callers race inside
 * Postgres itself: the loser sees no row come back, which is exactly "the slot was taken".
 */
export async function reserveCapacitySlot(
  businessId: string,
  opts: { leadId?: string | null; conversationId?: string | null } = {},
): Promise<{ reserved: boolean }> {
  const row = await getCapacity(businessId);
  if (!capacityIsOpen(row)) return { reserved: false };

  const claimed = await db
    .update(capacity)
    .set({ availableCapacity: sql`${capacity.availableCapacity} - 1`, updatedAt: new Date() })
    .where(
      and(
        eq(capacity.businessId, businessId),
        sql`${capacity.availableCapacity} > 0`,
        eq(capacity.acceptingNewCustomers, true),
      ),
    )
    .returning({ id: capacity.id });
  if (claimed.length === 0) return { reserved: false };

  const [reservation] = await db
    .insert(capacityReservations)
    .values({
      businessId,
      leadId: opts.leadId ?? null,
      conversationId: opts.conversationId ?? null,
    })
    .returning();

  if (opts.leadId) {
    await recordLeadEvent(opts.leadId, 'capacity_reserved', { kind: 'system' }, {
      reservationId: reservation.id,
    });
  }
  return { reserved: true };
}

/**
 * Returns a slot: the reservation row closes and the counter grows back by one, never
 * past the max — a double release can only inflate the counter to its ceiling.
 */
export async function releaseCapacitySlot(businessId: string, reservationId: string) {
  const reservation = await db.query.capacityReservations.findFirst({
    where: and(eq(capacityReservations.id, reservationId), eq(capacityReservations.businessId, businessId)),
  });
  if (!reservation || reservation.status !== 'active') return { released: false };

  const row = await getCapacity(businessId);
  await db
    .update(capacityReservations)
    .set({ status: 'released', releasedAt: new Date() })
    .where(eq(capacityReservations.id, reservation.id));
  await db
    .update(capacity)
    .set({
      availableCapacity: sql`least(${capacity.availableCapacity} + 1, ${row.maxCapacity})`,
      updatedAt: new Date(),
    })
    .where(eq(capacity.businessId, businessId));
  if (reservation.leadId) await recordLeadEvent(reservation.leadId, 'capacity_released', { kind: 'system' });
  return { released: true };
}

export async function listActiveReservations(businessId: string) {
  return db.query.capacityReservations.findMany({
    where: and(eq(capacityReservations.businessId, businessId), eq(capacityReservations.status, 'active')),
    orderBy: [desc(capacityReservations.createdAt)],
  });
}
