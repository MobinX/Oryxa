import Link from 'next/link';
import { Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { listAdminFacebookPendingPages, type AdminPendingPage } from '@/lib/api';
import { connectSelectedAdminPagesAction } from '@/app/actions/admin-channels';

export const instant = false;

/** The pages Meta handed back after the admin OAuth; choose which become admin-only channels. */
export default async function AdminFacebookPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; detail?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { token, error, detail } = await searchParams;

  if (!token) {
    return (
      <Card className="p-6">
        <p className="font-semibold">Missing page selection</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Start again from the channels page.
        </p>
        <Link href="/admin/channels" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to admin channels
        </Link>
      </Card>
    );
  }

  let pages: AdminPendingPage[] = [];
  let loadError: string | null = null;
  try {
    pages = (await listAdminFacebookPendingPages(bearer, token)).pages;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Could not load the Pages';
  }

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm"
        >
          <Facebook className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">Choose Pages</h1>
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-[15px]">
            Each chosen Page becomes an admin-only channel: no agent answers it, and merchants send
            their notification codes to it as a message.
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          <p role="alert">{error === 'no-selection' ? 'Choose at least one Page.' : `Facebook sign-in failed${detail ? `: ${detail}` : '.'}`}</p>
        </Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          <p role="alert">{loadError}</p>
        </Card>
      )}

      {!loadError && (
        <form action={connectSelectedAdminPagesAction.bind(null, token)} className="space-y-4">
          <ul className="grid gap-3">
            {pages.map((page) => (
              <li key={page.id}>
                <label
                  className={`flex items-center gap-3 rounded-card border border-border bg-card p-4 transition-colors ${
                    page.heldByStore ? 'opacity-60' : 'cursor-pointer hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="pageIds"
                    value={page.id}
                    disabled={page.heldByStore}
                    defaultChecked={page.connected}
                    className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{page.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Page id {page.id}
                    </span>
                  </span>
                  {page.heldByStore && (
                    <span className="shrink-0 text-xs font-medium text-amber-600">
                      Connected to a store
                    </span>
                  )}
                  {page.connected && (
                    <span className="shrink-0 text-xs font-medium text-primary">Admin channel</span>
                  )}
                </label>
              </li>
            ))}
          </ul>

          {pages.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              Facebook returned no Pages for this login.
            </Card>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pages.every((page) => page.heldByStore)}>
              Connect selected
            </Button>
            <Link href="/admin/channels" className="text-sm text-muted-foreground hover:underline">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
