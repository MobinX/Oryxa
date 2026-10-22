import Link from 'next/link';
import { Facebook, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, listAdminChannels, type AdminChannel } from '@/lib/api';
import { connectAdminFacebookAction } from '@/app/actions/admin-channels';

export const instant = false;

/**
 * The operator's own Facebook Pages. Channels connected here belong to nobody and answer no
 * customers: their DMs only redeem business notification codes, and every notice a business
 * stores is also delivered to those Messenger accounts.
 */
export default async function AdminChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; failed?: string; detail?: string; error?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { connected, failed, detail, error } = await searchParams;

  let channels: AdminChannel[] = [];
  let loadError: string | null = null;
  try {
    channels = (await listAdminChannels(bearer)).channels;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      loadError = 'The console session expired — sign in again.';
    } else {
      loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Radio className="h-6 w-6 text-primary" />
            Admin channels
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Pages that answer no customers. Their DMs only redeem a business&apos;s notification
            code; every notice a business stores is also sent to those Messenger accounts.
          </p>
        </div>
        <form action={connectAdminFacebookAction}>
          <Button type="submit">
            <Facebook className="mr-2 h-4 w-4" />
            Connect Facebook Page
          </Button>
        </form>
      </div>

      {error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          Connect failed{detail ? `: ${detail}` : '.'}
        </Card>
      )}
      {connected && (
        <Card className="border-primary/30 p-4 text-sm">
          {connected} page{connected === '1' ? '' : 's'} connected as admin-only.
          {failed && Number(failed) > 0 && detail ? ` ${failed} failed: ${detail}` : ''}
        </Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}

      {!loadError && channels.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No admin channel yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connect a Page above. Merchants then send their notification code to it as a message,
            and each notice arrives in their Messenger as well.
          </p>
        </Card>
      )}

      {channels.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <li key={channel.id}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{channel.pageName}</p>
                    <p className="truncate text-xs text-muted-foreground">Page id {channel.pageId}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Connected {new Date(channel.createdAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Admin only
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Need another Page? The picker lists every Page your Facebook login manages.{' '}
        <Link href="/admin/channels" className="text-primary hover:underline">
          Back to channels
        </Link>
        .
      </p>
    </div>
  );
}
