import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listFacebookPendingPages } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { connectSelectedFacebookPagesAction } from '@/app/actions/channels';

export default async function ConnectFacebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { businessId } = await params;
  const { token, error } = await searchParams;
  const authToken = await requireAuth();

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
        <Card className="p-4 text-sm text-red-600">
          Missing page selection token. Start over from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  let pages: Awaited<ReturnType<typeof listFacebookPendingPages>>;
  try {
    pages = await listFacebookPendingPages(authToken, businessId, token);
  } catch {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
        <Card className="p-4 text-sm text-red-600">
          This link expired or is invalid. Connect Facebook again from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  const alreadyConnected = pages.filter((p) => p.connected);
  const notYetConnected = pages.filter((p) => !p.connected);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Choose Facebook pages</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Select the pages you want to connect to this business. You can connect multiple pages.
        </p>
      </div>

      {error === 'no-selection' && (
        <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Select at least one page to connect.
        </Card>
      )}

      <form action={connectSelectedFacebookPagesAction.bind(null, businessId, token)}>
        <Card className="divide-y divide-[var(--border)] p-0">
          {pages.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">No Facebook pages found on this account.</p>
          ) : (
            pages.map((page) => (
              <label
                key={page.id}
                className="flex cursor-pointer items-start gap-3 p-4 hover:bg-[var(--muted)]/40"
              >
                <input
                  type="checkbox"
                  name="pageIds"
                  value={page.id}
                  defaultChecked={!page.connected && pages.length === 1}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{page.name}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    Page ID: {page.id}
                  </span>
                  {page.connected && (
                    <span className="mt-1 inline-block text-xs text-[var(--muted-foreground)]">
                      Already connected (select to refresh access token)
                    </span>
                  )}
                </span>
              </label>
            ))
          )}
        </Card>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" className="w-full sm:w-auto" disabled={pages.length === 0}>
            Connect selected
          </Button>
          <Link
            href={`/b/${businessId}/channels`}
            className="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-border bg-card px-5 text-sm font-medium text-foreground transition-all hover:bg-muted sm:w-auto"
          >
            Cancel
          </Link>
        </div>

        {alreadyConnected.length > 0 && notYetConnected.length > 0 && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Some pages are already linked to this business. Select them again to refresh their Facebook access token.
          </p>
        )}
      </form>
    </div>
  );
}
