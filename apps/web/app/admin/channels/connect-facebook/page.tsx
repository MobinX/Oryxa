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
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Facebook className="h-6 w-6 text-primary" />
          Choose Pages
        </h1>
        <p className="mt-1 text-muted-foreground">
          Each chosen Page becomes an admin-only channel: no agent answers it, and merchants send
          their notification codes to it as a message.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {error === 'no-selection' ? 'Choose at least one Page.' : `Facebook sign-in failed${detail ? `: ${detail}` : '.'}`}
        </Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}

      {!loadError && (
        <form action={connectSelectedAdminPagesAction.bind(null, token)} className="space-y-4">
          <ul className="grid gap-3">
            {pages.map((page) => (
              <li key={page.id}>
                <label
                  className={`flex items-center gap-3 rounded-card border border-border bg-card p-4 ${
                    page.heldByStore ? 'opacity-60' : 'cursor-pointer hover:bg-muted/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="pageIds"
                    value={page.id}
                    disabled={page.heldByStore}
                    defaultChecked={page.connected}
                    className="h-4 w-4"
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
