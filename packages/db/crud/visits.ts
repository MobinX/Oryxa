import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { visits } from '@db/schema';

/**
 * Records one visit per visitor per store per day; a repeat returns false and writes
 * nothing.
 *
 * The day boundary is the database's own `date_trunc('day', now())` rather than a
 * Date built in Node: `created_at` is a `timestamp without time zone` holding UTC,
 * and a JS Date reaching the driver has already passed through the process's zone.
 * Letting Postgres compare its clock to its column keeps the window exact no matter
 * where the code runs.
 *
 * A visitor that was already counted returns false and writes nothing, which is what
 * makes this endpoint cheap to spam: every repeat costs one indexed read.
 */
export async function recordVisit(input: {
  businessId: string;
  visitor: string;
  path: string;
}): Promise<boolean> {
  const [seen] = await db
    .select({ id: visits.id })
    .from(visits)
    .where(
      and(
        eq(visits.businessId, input.businessId),
        eq(visits.visitor, input.visitor),
        gte(visits.createdAt, sql`date_trunc('day', now())`),
      ),
    )
    .limit(1);
  if (seen) return false;

  await db.insert(visits).values(input);
  return true;
}
