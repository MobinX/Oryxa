import { redirect } from 'next/navigation';

type RawParams = Record<string, string | string[] | undefined>;

/** See the `/logs` shim: a prerendered redirect never reaches the browser as a redirect. */
export const dynamic = 'force-dynamic';

/** Sign-in moved to `/admin/login`; `?error=` still has to reach the form. */
export default async function LegacyLogsLoginPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) params.set(key, one);
  }
  const query = params.toString();
  redirect(`/admin/login${query ? `?${query}` : ''}`);
}
