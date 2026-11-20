import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import {
  externalServiceChannels,
  externalServicePendingPages,
  externalServicePosts,
  externalServices,
  externalServiceWebhooks,
} from '@db/schema';
import { decryptChannelToken, encryptChannelToken } from '@repo/db/crud/channel';
import {
  createExternalServiceInputSchema,
  updateExternalServiceInputSchema,
  type ExternalPostMedia,
} from '@repo/shared';

/** A unique_name that is already in use by a live service. */
export class ExternalServiceTakenError extends Error {
  constructor() {
    super('That unique name is already used by another external service.');
    this.name = 'ExternalServiceTakenError';
  }
}

/** A platform account already connected live by another external service. */
export class ExternalChannelTakenError extends Error {
  constructor() {
    super('That platform account is already connected to another external service.');
    this.name = 'ExternalChannelTakenError';
  }
}

type ExternalPlatform = 'facebook' | 'instagram' | 'whatsapp' | 'telegram';

// ── Services ─────────────────────────────────────────────────────────────────

export async function createExternalService(input: unknown) {
  const parsed = createExternalServiceInputSchema.parse(input);

  const existing = await db.query.externalServices.findFirst({
    where: eq(externalServices.uniqueName, parsed.uniqueName),
  });
  if (existing && !existing.deletedAt) throw new ExternalServiceTakenError();

  if (existing?.deletedAt) {
    // Reuse a soft-deleted name rather than making the caller invent a new one.
    const [restored] = await db
      .update(externalServices)
      .set({ name: parsed.name, deletedAt: null, updatedAt: new Date() })
      .where(eq(externalServices.id, existing.id))
      .returning();
    return restored;
  }

  const [created] = await db
    .insert(externalServices)
    .values({ name: parsed.name, uniqueName: parsed.uniqueName })
    .returning();
  return created;
}

export async function updateExternalService(id: string, input: unknown) {
  const parsed = updateExternalServiceInputSchema.parse(input);
  if (parsed.uniqueName) {
    const taken = await db.query.externalServices.findFirst({
      where: and(eq(externalServices.uniqueName, parsed.uniqueName), isNull(externalServices.deletedAt)),
    });
    if (taken && taken.id !== id) throw new ExternalServiceTakenError();
  }
  const [updated] = await db
    .update(externalServices)
    .set({ ...parsed, updatedAt: new Date() })
    .where(and(eq(externalServices.id, id), isNull(externalServices.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function getExternalService(id: string) {
  return db.query.externalServices.findFirst({
    where: and(eq(externalServices.id, id), isNull(externalServices.deletedAt)),
  });
}

export async function getExternalServiceByUniqueName(uniqueName: string) {
  return db.query.externalServices.findFirst({
    where: and(eq(externalServices.uniqueName, uniqueName), isNull(externalServices.deletedAt)),
  });
}

export async function deleteExternalService(id: string) {
  const service = await getExternalService(id);
  if (!service) return null;
  const now = new Date();
  await db
    .update(externalServices)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(externalServices.id, id));
  // Children follow the service: a deleted service must not keep delivering webhooks or
  // holding a live platform account.
  await db
    .update(externalServiceWebhooks)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(externalServiceWebhooks.serviceId, id), isNull(externalServiceWebhooks.deletedAt)));
  await db
    .update(externalServiceChannels)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(externalServiceChannels.serviceId, id), isNull(externalServiceChannels.deletedAt)));
  return { deleted: true };
}

export async function searchExternalServices(query: { id?: string; uname?: string }) {
  if (query.id) {
    const row = await getExternalService(query.id);
    return row ? [row] : [];
  }
  if (query.uname) {
    const row = await getExternalServiceByUniqueName(query.uname);
    return row ? [row] : [];
  }
  return [];
}

export async function listExternalServices(page: number, limit: number) {
  const where = isNull(externalServices.deletedAt);
  const [totalRow] = await db
    .select({ value: count() })
    .from(externalServices)
    .where(where);
  const items = await db.query.externalServices.findMany({
    where,
    orderBy: [desc(externalServices.createdAt)],
    limit,
    offset: (page - 1) * limit,
  });
  return { items, page, limit, total: Number(totalRow?.value ?? 0) };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export async function createExternalServiceWebhook(serviceId: string, url: string) {
  const service = await getExternalService(serviceId);
  if (!service) return null;
  const [created] = await db
    .insert(externalServiceWebhooks)
    .values({ serviceId, webhookUrl: url })
    .returning();
  return created;
}

export async function updateExternalServiceWebhook(
  serviceId: string,
  webhookId: string,
  url: string,
) {
  const [updated] = await db
    .update(externalServiceWebhooks)
    .set({ webhookUrl: url, updatedAt: new Date() })
    .where(
      and(
        eq(externalServiceWebhooks.id, webhookId),
        eq(externalServiceWebhooks.serviceId, serviceId),
        isNull(externalServiceWebhooks.deletedAt),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function getExternalServiceWebhook(serviceId: string, webhookId: string) {
  return db.query.externalServiceWebhooks.findFirst({
    where: and(
      eq(externalServiceWebhooks.id, webhookId),
      eq(externalServiceWebhooks.serviceId, serviceId),
      isNull(externalServiceWebhooks.deletedAt),
    ),
  });
}

export async function deleteExternalServiceWebhook(serviceId: string, webhookId: string) {
  const [deleted] = await db
    .update(externalServiceWebhooks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(externalServiceWebhooks.id, webhookId),
        eq(externalServiceWebhooks.serviceId, serviceId),
        isNull(externalServiceWebhooks.deletedAt),
      ),
    )
    .returning({ id: externalServiceWebhooks.id });
  return deleted ? { deleted: true } : null;
}

/** Every live webhook URL for a service, oldest first. */
export async function listExternalServiceWebhooks(serviceId: string) {
  return db.query.externalServiceWebhooks.findMany({
    where: and(
      eq(externalServiceWebhooks.serviceId, serviceId),
      isNull(externalServiceWebhooks.deletedAt),
    ),
    orderBy: [asc(externalServiceWebhooks.createdAt)],
  });
}

// ── Channels ─────────────────────────────────────────────────────────────────

export async function upsertExternalServiceChannel(input: {
  serviceId: string;
  name: string;
  platform: ExternalPlatform;
  accessToken: string;
  refreshToken?: string | null;
  platformChannelId: string;
}) {
  const service = await getExternalService(input.serviceId);
  if (!service) return null;

  const live = await db.query.externalServiceChannels.findFirst({
    where: and(
      eq(externalServiceChannels.platform, input.platform),
      eq(externalServiceChannels.platformChannelId, input.platformChannelId),
      isNull(externalServiceChannels.deletedAt),
    ),
  });
  if (live && live.serviceId !== input.serviceId) throw new ExternalChannelTakenError();

  const existing = await db.query.externalServiceChannels.findFirst({
    where: and(
      eq(externalServiceChannels.serviceId, input.serviceId),
      eq(externalServiceChannels.platform, input.platform),
      eq(externalServiceChannels.platformChannelId, input.platformChannelId),
    ),
  });

  const values = {
    name: input.name,
    accessToken: encryptChannelToken(input.accessToken)!,
    refreshToken: encryptChannelToken(input.refreshToken ?? null),
    deletedAt: null,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(externalServiceChannels)
      .set(values)
      .where(eq(externalServiceChannels.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(externalServiceChannels)
    .values({
      serviceId: input.serviceId,
      platform: input.platform,
      platformChannelId: input.platformChannelId,
      ...values,
    })
    .returning();
  return created;
}

type ChannelTokenRow = { accessToken: string; refreshToken: string | null };

function revealChannelTokens<T extends ChannelTokenRow>(row: T | null): T | null {
  if (!row) return null;
  row.accessToken = decryptChannelToken(row.accessToken);
  if (row.refreshToken) row.refreshToken = decryptChannelToken(row.refreshToken);
  return row;
}

/** One live channel of a service for a platform account. Token revealed for the platform call. */
export async function getExternalServiceChannel(
  serviceId: string,
  platformChannelId: string,
  platform: ExternalPlatform = 'facebook',
) {
  const row = await db.query.externalServiceChannels.findFirst({
    where: and(
      eq(externalServiceChannels.serviceId, serviceId),
      eq(externalServiceChannels.platform, platform),
      eq(externalServiceChannels.platformChannelId, platformChannelId),
      isNull(externalServiceChannels.deletedAt),
    ),
  });
  return revealChannelTokens(row ?? null);
}

/** Resolves the external owner of a platform account from the id a webhook carries. */
export async function getExternalServiceChannelByPageId(
  platformChannelId: string,
  platform: ExternalPlatform = 'facebook',
) {
  const row = await db.query.externalServiceChannels.findFirst({
    where: and(
      eq(externalServiceChannels.platform, platform),
      eq(externalServiceChannels.platformChannelId, platformChannelId),
      isNull(externalServiceChannels.deletedAt),
    ),
  });
  return revealChannelTokens(row ?? null);
}

/**
 * The service + live webhook URLs that should hear about an inbound event for this account.
 * Null when the account is not connected to any external service.
 */
export async function findExternalWebhookTargets(
  platformChannelId: string,
  platform: ExternalPlatform = 'facebook',
) {
  const channel = await getExternalServiceChannelByPageId(platformChannelId, platform);
  if (!channel) return null;
  const hooks = await listExternalServiceWebhooks(channel.serviceId);
  return {
    serviceId: channel.serviceId,
    channelId: channel.id,
    accessToken: channel.accessToken,
    webhooks: hooks.map((hook) => hook.webhookUrl),
  };
}

// ── Pending OAuth pages ──────────────────────────────────────────────────────

/** Banks a Page token between the OAuth callback and `connectChannel`. */
export async function savePendingPage(input: {
  businessId: string;
  pageId: string;
  pageName: string;
  accessToken: string;
  refreshToken?: string | null;
  ttlSeconds?: number;
}) {
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 600) * 1000);
  const [row] = await db
    .insert(externalServicePendingPages)
    .values({
      businessId: input.businessId,
      pageId: input.pageId,
      pageName: input.pageName,
      accessToken: encryptChannelToken(input.accessToken)!,
      refreshToken: encryptChannelToken(input.refreshToken ?? null),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [externalServicePendingPages.businessId, externalServicePendingPages.pageId],
      set: {
        pageName: input.pageName,
        accessToken: encryptChannelToken(input.accessToken)!,
        refreshToken: encryptChannelToken(input.refreshToken ?? null),
        expiresAt,
      },
    })
    .returning();
  return row;
}

/** A live banked Page token, or null when it expired or was never stored. */
export async function getPendingPage(pageId: string, businessId?: string) {
  const conditions = [
    eq(externalServicePendingPages.pageId, pageId),
    gt(externalServicePendingPages.expiresAt, new Date()),
  ];
  if (businessId) conditions.push(eq(externalServicePendingPages.businessId, businessId));
  const row = await db.query.externalServicePendingPages.findFirst({
    where: and(...conditions),
    orderBy: [desc(externalServicePendingPages.createdAt)],
  });
  if (!row) return null;
  return {
    ...row,
    accessToken: decryptChannelToken(row.accessToken),
    refreshToken: row.refreshToken ? decryptChannelToken(row.refreshToken) : null,
  };
}

export async function deletePendingPage(id: string) {
  await db
    .delete(externalServicePendingPages)
    .where(eq(externalServicePendingPages.id, id));
}

/** Removes expired banked tokens; called opportunistically by the OAuth landing route. */
export async function pruneExpiredPendingPages() {
  await db
    .delete(externalServicePendingPages)
    .where(sql`${externalServicePendingPages.expiresAt} <= now()`);
}

// ── Posts ────────────────────────────────────────────────────────────────────

export async function createExternalServicePost(input: {
  serviceId: string;
  channelId: string;
  platform: ExternalPlatform;
  platformPostId: string;
  platformChannelId: string;
  text?: string | null;
  media?: ExternalPostMedia[];
}) {
  const [created] = await db
    .insert(externalServicePosts)
    .values({
      serviceId: input.serviceId,
      channelId: input.channelId,
      platform: input.platform,
      platformPostId: input.platformPostId,
      platformChannelId: input.platformChannelId,
      text: input.text ?? null,
      media: input.media ?? [],
    })
    .returning();
  return created;
}

export async function getExternalServicePost(serviceId: string, platformPostId: string) {
  return db.query.externalServicePosts.findFirst({
    where: and(
      eq(externalServicePosts.serviceId, serviceId),
      eq(externalServicePosts.platformPostId, platformPostId),
      isNull(externalServicePosts.deletedAt),
    ),
  });
}

export async function updateExternalServicePost(
  serviceId: string,
  platformPostId: string,
  text: string,
) {
  const [updated] = await db
    .update(externalServicePosts)
    .set({ text, updatedAt: new Date() })
    .where(
      and(
        eq(externalServicePosts.serviceId, serviceId),
        eq(externalServicePosts.platformPostId, platformPostId),
        isNull(externalServicePosts.deletedAt),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function deleteExternalServicePost(serviceId: string, platformPostId: string) {
  const [deleted] = await db
    .update(externalServicePosts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(externalServicePosts.serviceId, serviceId),
        eq(externalServicePosts.platformPostId, platformPostId),
        isNull(externalServicePosts.deletedAt),
      ),
    )
    .returning({ id: externalServicePosts.id });
  return deleted ? { deleted: true } : null;
}
