import { and, asc, desc, eq, ilike, or, sql, isNull } from 'drizzle-orm';
import {
  officialSettingsSchema,
  ticketPatchSchema,
  prospectWeightsSchema,
  prospectPatchSchema,
} from '@repo/shared';
import type {
  OfficialSettingsPatch,
  TicketPatch,
  ProspectPatch,
  ProspectWeights,
} from '@repo/shared';
import { db } from '@db/client';
import {
  officialSettings,
  ticketEvents,
  tickets,
  prospectEvents,
  prospectWeights,
  prospects,
} from '@db/schema';

/**
 * Official Channels CRUD: settings, tickets and onboarding prospects. Same flat
 * named-async-fn convention as the other crud files; the event tables are append-only.
 * Wire schemas live in @repo/shared (official.ts); field lists here mirror them.
 */

/* ---------------- settings (singleton row) ---------------- */

export type OfficialSettingsRow = typeof officialSettings.$inferSelect;

export async function getSettings(): Promise<OfficialSettingsRow> {
  const row = await db.query.officialSettings.findFirst();
  if (row) return row;
  // The singleton has not been created by anything yet; first read makes the row.
  const [created] = await db.insert(officialSettings).values({}).onConflictDoNothing().returning();
  if (created) return created;
  const again = await db.query.officialSettings.findFirst();
  if (!again) throw new Error('official_settings singleton missing after upsert');
  return again;
}

export async function updateSettings(input: OfficialSettingsPatch): Promise<OfficialSettingsRow> {
  const parsed = officialSettingsSchema.parse(input);
  const current = await getSettings();
  const [row] = await db
    .update(officialSettings)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(officialSettings.id, current.id))
    .returning();
  if (!row) throw new Error('official_settings update lost its row');
  return row;
}

/* ---------------- events (shared append-only shape) ---------------- */

export type ActorRef = { kind: 'operator' | 'ai' | 'system'; userId?: string | null };

/* ---------------- tickets ---------------- */

const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type TicketRow = typeof tickets.$inferSelect;
export type TicketEventRow = typeof ticketEvents.$inferSelect;

export type TicketFilters = {
  type?: 'support' | 'security';
  status?: (typeof TICKET_STATUSES)[number];
  priority?: (typeof TICKET_PRIORITIES)[number];
  channelId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listTickets(filters: TicketFilters): Promise<TicketRow[]> {
  const conditions = [] as ReturnType<typeof eq>[];
  if (filters.type) conditions.push(eq(tickets.type, filters.type));
  if (filters.status) conditions.push(eq(tickets.status, filters.status));
  if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));
  if (filters.channelId) conditions.push(eq(tickets.channelId, filters.channelId));
  if (filters.search) {
    const needle = `%${filters.search}%`;
    const match = or(
      ilike(tickets.subject, needle),
      ilike(tickets.customerPlatformId, needle),
      ilike(tickets.customerName, needle),
    );
    if (match) conditions.push(match as ReturnType<typeof eq>);
  }
  return db
    .select()
    .from(tickets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tickets.updatedAt))
    .limit(Math.min(filters.limit ?? 50, 200))
    .offset(filters.offset ?? 0);
}

export async function getTicketById(ticketId: string): Promise<TicketRow | null> {
  return (await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) })) ?? null;
}

export async function listTicketEvents(ticketId: string): Promise<TicketEventRow[]> {
  return db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(asc(ticketEvents.createdAt));
}

export type TicketCreate = {
  channelId: string;
  conversationId?: string | null;
  customerPlatformId: string;
  customerName?: string | null;
  type: 'support' | 'security';
  subject?: string | null;
  summary?: string | null;
  priority?: (typeof TICKET_PRIORITIES)[number];
  actor: ActorRef;
};

/**
 * Get-or-create the ticket carrying an intent. One open ticket per conversation + type:
 * repeated turns of the same problem append to the first one, they do not pile up rows.
 */
export async function upsertTicketFromTurn(input: TicketCreate): Promise<{ ticket: TicketRow; created: boolean }> {
  if (input.conversationId) {
    const open = await db.query.tickets.findFirst({
      where: and(
        eq(tickets.conversationId, input.conversationId),
        eq(tickets.type, input.type),
        sql`${tickets.status} in ('open', 'in_progress', 'waiting')`,
      ),
      orderBy: [desc(tickets.createdAt)],
    });
    if (open) {
      await recordTicketEvent(open.id, input.actor, 'ai_turn', {
        summary: input.summary ?? null,
        customerName: input.customerName ?? null,
      });
      return { ticket: open, created: false };
    }
  }

  const [created] = await db
    .insert(tickets)
    .values({
      channelId: input.channelId,
      conversationId: input.conversationId ?? null,
      customerPlatformId: input.customerPlatformId,
      customerName: input.customerName ?? null,
      type: input.type,
      priority: input.priority ?? 'normal',
      subject: input.subject ?? null,
      summary: input.summary ?? null,
    })
    .returning();
  if (!created) throw new Error('ticket insert vanished');
  await recordTicketEvent(created.id, input.actor, 'created', {
    type: input.type,
    subject: input.subject ?? null,
    summary: input.summary ?? null,
  });
  return { ticket: created, created: true };
}

export async function recordTicketEvent(
  ticketId: string,
  actor: ActorRef,
  kind: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.insert(ticketEvents).values({
    ticketId,
    actorKind: actor.kind,
    actorUserId: actor.userId ?? null,
    kind,
    data,
  });
}

export async function updateTicket(
  ticketId: string,
  patch: TicketPatch,
  actor: ActorRef,
): Promise<TicketRow | null> {
  const before = await getTicketById(ticketId);
  if (!before) return null;
  const parsed = ticketPatchSchema.parse(patch);
  const [row] = await db
    .update(tickets)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  if (!row) return null;

  if (parsed.status && parsed.status !== before.status) {
    await recordTicketEvent(ticketId, actor, 'status', { from: before.status, to: parsed.status });
  }
  if (parsed.priority && parsed.priority !== before.priority) {
    await recordTicketEvent(ticketId, actor, 'priority', { from: before.priority, to: parsed.priority });
  }
  if (parsed.assigneeUserId !== undefined && parsed.assigneeUserId !== before.assigneeUserId) {
    await recordTicketEvent(ticketId, actor, 'assignee', { to: parsed.assigneeUserId ?? null });
  }
  return row;
}

/** One operator-visible note builds a ticket_event; the `notes` column stays a scratch area. */
export async function addTicketNote(
  ticketId: string,
  note: string,
  actor: ActorRef,
): Promise<TicketRow | null> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;
  await recordTicketEvent(ticketId, actor, 'note', { note });
  const [row] = await db
    .update(tickets)
    .set({ updatedAt: new Date(), notes: note })
    .where(eq(tickets.id, ticketId))
    .returning();
  return row ?? ticket;
}

/* ---------------- prospects ---------------- */

const PROSPECT_STATUSES = [
  'new',
  'reviewing',
  'prioritized',
  'onboarding_requested',
  'onboarded',
  'rejected',
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export type ProspectRow = typeof prospects.$inferSelect;
export type ProspectEventRow = typeof prospectEvents.$inferSelect;

const PROSPECT_FIELDS = [
  'name',
  'country',
  'businessType',
  'employeesEstimate',
  'budget',
  'needs',
] as const;

export type ProspectObserved = Partial<Record<(typeof PROSPECT_FIELDS)[number], string>> & {
  consent?: boolean;
};

export type ProspectFilters = {
  status?: ProspectStatus;
  channelId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listProspects(filters: ProspectFilters): Promise<ProspectRow[]> {
  const conditions = [isNull(prospects.deletedAt)] as ReturnType<typeof eq>[];
  if (filters.status) conditions.push(eq(prospects.status, filters.status));
  if (filters.channelId) conditions.push(eq(prospects.channelId, filters.channelId));
  if (filters.search) {
    const needle = `%${filters.search}%`;
    const match = or(
      ilike(prospects.name, needle),
      ilike(prospects.contactPlatformId, needle),
      ilike(prospects.businessType, needle),
      ilike(prospects.needs, needle),
    );
    if (match) conditions.push(match as ReturnType<typeof eq>);
  }
  return db
    .select()
    .from(prospects)
    .where(and(...conditions))
    .orderBy(desc(prospects.score), desc(prospects.updatedAt))
    .limit(Math.min(filters.limit ?? 100, 200))
    .offset(filters.offset ?? 0);
}

export async function getProspectById(prospectId: string): Promise<ProspectRow | null> {
  return (await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) })) ?? null;
}

export async function listProspectEvents(prospectId: string): Promise<ProspectEventRow[]> {
  return db
    .select()
    .from(prospectEvents)
    .where(eq(prospectEvents.prospectId, prospectId))
    .orderBy(asc(prospectEvents.createdAt));
}

export async function findProspectId(
  channelId: string,
  contactPlatformId: string,
): Promise<string | null> {
  const row = await db.query.prospects.findFirst({
    where: and(
      eq(prospects.channelId, channelId),
      eq(prospects.contactPlatformId, contactPlatformId),
      isNull(prospects.deletedAt),
    ),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export async function updateProspect(
  prospectId: string,
  patch: ProspectPatch,
  actor: ActorRef,
): Promise<ProspectRow | null> {
  const before = await getProspectById(prospectId);
  if (!before) return null;
  const parsed = prospectPatchSchema.parse(patch);
  const [row] = await db
    .update(prospects)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(prospects.id, prospectId))
    .returning();
  if (!row) return null;
  if (parsed.status && parsed.status !== before.status) {
    await recordProspectEvent(prospectId, 'status_change', actor, { from: before.status, to: parsed.status });
  }
  return row;
}

export async function recordProspectEvent(
  prospectId: string,
  kind: string,
  actor: ActorRef,
  data: Record<string, unknown>,
): Promise<void> {
  await db.insert(prospectEvents).values({
    prospectId,
    actorKind: actor.kind,
    actorUserId: actor.userId ?? null,
    kind,
    data,
  });
}

/* ---------------- scoring ---------------- */

const DEFAULT_WEIGHTS: Record<string, number> = {
  name: 0,
  country: 1,
  businessType: 2,
  employeesEstimate: 2,
  budget: 3,
  needs: 2,
};

export type Weights = Record<string, number>;

export type ScoreResult = { score: number; breakdown: Record<string, number> };

/** Filled fields earn their weight sum; a needs paragraph counts once, not per word. */
export function scoreProspect(observed: Record<string, unknown>, weights: Weights): ScoreResult {
  const breakdown: Record<string, number> = {};
  let score = 0;
  for (const field of PROSPECT_FIELDS) {
    const value = observed[field];
    const filled = typeof value === 'string' ? value.trim().length > 0 : value != null;
    if (!filled) continue;
    const weight = weights[field] ?? DEFAULT_WEIGHTS[field] ?? 0;
    if (!weight) continue;
    breakdown[field] = weight;
    score += weight;
  }
  if (observed.consent === true) {
    breakdown.consent = 1;
    score += 1;
  }
  return { score, breakdown };
}

export async function getWeights(): Promise<{ row: typeof prospectWeights.$inferSelect; weights: Weights }> {
  const row = await db.query.prospectWeights.findFirst();
  if (row) return { row, weights: (row.weights ?? {}) as Weights };
  const [created] = await db.insert(prospectWeights).values({ weights: {} }).onConflictDoNothing().returning();
  if (created) return { row: created, weights: (created.weights ?? {}) as Weights };
  const again = await db.query.prospectWeights.findFirst();
  if (!again) throw new Error('prospect_weights singleton missing after upsert');
  return { row: again, weights: (again.weights ?? {}) as Weights };
}

export async function saveWeights(weights: ProspectWeights): Promise<Weights> {
  const parsed = prospectWeightsSchema.parse(weights);
  const { row } = await getWeights();
  await db
    .update(prospectWeights)
    .set({ weights: parsed, updatedAt: new Date() })
    .where(eq(prospectWeights.id, row.id));
  return parsed as Weights;
}

/**
 * The ingest path: get-or-create the (channel, contact) prospect, fold in only what this
 * turn actually offered, keep consent sticky (an opt-out survives observed consent, and
 * consent is stamped the moment it flips), and re-score if anything materialised.
 */
export async function upsertProspectFromTurn(
  identity: {
    channelId: string;
    conversationId?: string | null;
    platform: string;
    contactPlatformId: string;
  },
  observed: ProspectObserved,
  actor: ActorRef,
): Promise<ProspectRow> {
  const existing = await db.query.prospects.findFirst({
    where: and(
      eq(prospects.channelId, identity.channelId),
      eq(prospects.contactPlatformId, identity.contactPlatformId),
      isNull(prospects.deletedAt),
    ),
  });

  const providedFields: ProspectObserved = {};
  for (const field of PROSPECT_FIELDS) {
    const value = observed[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      providedFields[field] = value.trim().slice(0, field === 'needs' ? 4000 : 255);
    }
  }
  const hasFields = Object.keys(providedFields).length > 0;
  // Consent mirrors what the customer actually said in their latest turn; the AI only
  // relays it. `consentAt` is stamped the first time it turns true.
  const consentWanted = observed.consent === true;
  const consentDeclined = observed.consent === false;

  if (existing) {
    const merged = { ...existing } as Record<string, unknown>;
    for (const [field, value] of Object.entries(providedFields)) {
      if (merged[field] == null) merged[field] = value;
    }
    merged.conversationId = identity.conversationId ?? merged.conversationId;
    if (consentWanted && !merged.consent) {
      merged.consent = true;
      merged.consentAt = merged.consentAt ?? new Date();
    }
    if (consentDeclined && merged.consent) {
      merged.consent = false;
      merged.consentAt = null;
    }

    const changedFields = providedFields
      ? Object.keys(providedFields).filter(
          (field) =>
            (merged[field as string] as unknown) !==
            (existing[field as keyof ProspectRow] as unknown),
        )
      : [];
    const consentChanged = merged.consent !== existing.consent;
    if (!changedFields.length && !consentChanged) return existing;

    const { weights } = await getWeights();
    const scored = scoreProspect({ ...merged, consent: merged.consent as boolean }, weights);
    const [row] = await db
      .update(prospects)
      .set({
        name: (merged.name as string | null) ?? null,
        country: (merged.country as string | null) ?? null,
        businessType: (merged.businessType as string | null) ?? null,
        employeesEstimate: (merged.employeesEstimate as string | null) ?? null,
        budget: (merged.budget as string | null) ?? null,
        needs: (merged.needs as string | null) ?? null,
        consent: merged.consent as boolean,
        consentAt: (merged.consentAt as Date | null) ?? null,
        conversationId: (merged.conversationId as string | null) ?? null,
        score: scored.score,
        scoreBreakdown: scored.breakdown,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, existing.id))
      .returning();
    if (!row) throw new Error('prospect update vanished');
    await recordProspectEvent(row.id, hasFields || consentChanged ? 'ai_observed' : 'touched', actor, {
      observed: Object.keys(providedFields),
      ...(consentChanged ? { consent: row.consent } : {}),
      score: scored.score,
    });
    return row;
  }

  const { weights } = await getWeights();
  const seed = {
    ...providedFields,
    consent: consentWanted,
  };
  const scored = scoreProspect(seed, weights);
  const [created] = await db
    .insert(prospects)
    .values({
      channelId: identity.channelId,
      conversationId: identity.conversationId ?? null,
      platform: identity.platform,
      contactPlatformId: identity.contactPlatformId,
      name: providedFields.name ?? null,
      country: providedFields.country ?? null,
      businessType: providedFields.businessType ?? null,
      employeesEstimate: providedFields.employeesEstimate ?? null,
      budget: providedFields.budget ?? null,
      needs: providedFields.needs ?? null,
      consent: consentWanted,
      consentAt: consentWanted ? new Date() : null,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
    })
    .returning();
  if (!created) throw new Error('prospect insert vanished');
  await recordProspectEvent(created.id, 'created', actor, {
    observed: Object.keys(providedFields),
    consent: consentWanted,
    score: scored.score,
  });
  return created;
}

/**
 * Re-applies the current weights to every live prospect. Scoring is deterministic on the
 * stored fields, so a plain sequential update is exact; the driver has no transaction, and
 * a validated save above is the only writer of the weights, so mid-loop drift cannot bias
 * a ranking anyone trusts.
 */
export async function rescoreProspects(): Promise<number> {
  const { weights } = await getWeights();
  const rows = await db.select().from(prospects).where(isNull(prospects.deletedAt));
  let changed = 0;
  for (const row of rows) {
    const scored = scoreProspect({ ...row, consent: row.consent }, weights);
    if (scored.score === row.score) continue;
    changed += 1;
    await db
      .update(prospects)
      .set({ score: scored.score, scoreBreakdown: scored.breakdown, updatedAt: new Date() })
      .where(eq(prospects.id, row.id));
  }
  return changed;
}
