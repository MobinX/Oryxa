import { redirect } from 'next/navigation';

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Without this the route is statically prerendered, `redirect()` runs once at build
 * time and the browser is served the prerendered shell with a 200 — so the forward
 * silently does nothing. Reading the query already makes it dynamic in principle;
 * saying so keeps it that way whatever the cache does.
 */
export const dynamic = 'force-dynamic';

function queryString(params: RawParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) query.set(key, one);
  }
  return query.toString();
}

/**
 * The console moved to `/admin/logs`. A bookmark, a pasted link in an Axiom alert
 * or a message the operator sent themselves must land on the same filtered page,
 * not on a 404 — so the old path forwards its query untouched.
 */
export default async function LegacyLogsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const query = queryString(await searchParams);
  redirect(`/admin/logs${query ? `?${query}` : ''}`);
}
