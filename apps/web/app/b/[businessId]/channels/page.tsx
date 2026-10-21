import { Suspense } from 'react';
import { Trash2 } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { cachedChannels } from '@/app/_cache/queries';
import type { Channel } from '@/lib/api';
import { COMPANY_NAME } from '@/lib/brand';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableHeader } from '@/components/data-table';
import { FacebookConnectButton } from '@/components/facebook-connect-button';
import { InstagramConnectButton } from '@/components/instagram-connect-button';
import {
  deleteChannelAction,
  deleteChannelsBulkAction,
} from '@/app/actions/channels';
import { DeleteSuccessDialog } from '@/components/delete-success-dialog';
import ChannelsSkeleton from './skeleton';

const channelHeaders: DataTableHeader[] = [
  { key: 'platform', header: 'Platform', className: 'min-w-[100px]' },
  { key: 'pageName', header: 'Account', className: 'w-full min-w-[140px]' },
  { key: 'platformChannelId', header: 'Account ID', className: 'hidden sm:table-cell' },
];

export default function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    connected?: string;
    error?: string;
    detail?: string;
    subscribeFailed?: string;
    subscribeDetail?: string;
  }>;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Channels</h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Connect the Pages and Instagram accounts your customers already write to.
        </p>
      </div>
      <Suspense fallback={<ChannelsSkeleton />}>
        <ChannelsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ChannelsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    connected?: string;
    error?: string;
    detail?: string;
    subscribeFailed?: string;
    subscribeDetail?: string;
  }>;
}) {
  const { businessId } = await params;
  const { connected, error, detail, subscribeFailed, subscribeDetail } = await searchParams;
  const token = await requireAuth();
  const channels = await cachedChannels(token, businessId);

  const channelRows = channels.map((channel: Channel) => ({
    id: channel.id,
    cells: [
      <span key="platform" className="font-medium capitalize">
        {channel.platform}
      </span>,
      <span key="pageName" className="font-medium">
        {channel.pageName ?? '—'}
      </span>,
      <span key="platformChannelId" className="text-[var(--muted-foreground)]">
        {channel.platformChannelId}
      </span>,
    ],
    actions: (
      <form action={deleteChannelAction.bind(null, businessId, channel.id)}>
        <button
          type="submit"
          className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline font-semibold"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
        </button>
      </form>
    ),
  }));

  return (
    <>
      <DeleteSuccessDialog />

      {connected === 'facebook' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Facebook page(s) connected successfully.
          {subscribeFailed && (
            <span className="mt-1 block text-amber-800 dark:text-amber-200">
              {subscribeFailed} page(s) could not be subscribed for webhooks — check Meta app webhook settings and
              `pages_manage_metadata` permission.
              {subscribeDetail && (
                <span className="mt-1 block text-xs opacity-90">{decodeURIComponent(subscribeDetail)}</span>
              )}
            </span>
          )}
        </Card>
      )}

      {connected === 'instagram' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Instagram account(s) connected successfully.
          {subscribeFailed && (
            <span className="mt-1 block text-amber-800 dark:text-amber-200">
              {subscribeFailed} account(s) could not be subscribed for webhooks — check the Meta app webhook
              settings and the Instagram permissions.
              {subscribeDetail && (
                <span className="mt-1 block text-xs opacity-90">{decodeURIComponent(subscribeDetail)}</span>
              )}
            </span>
          )}
        </Card>
      )}

      {error === 'facebook-subscribe' && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Facebook connect failed.
          {detail && <span className="mt-1 block text-xs opacity-90">{decodeURIComponent(detail)}</span>}
        </Card>
      )}

      {error === 'instagram-connect' && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Instagram connect failed.
          {detail && <span className="mt-1 block text-xs opacity-90">{decodeURIComponent(detail)}</span>}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Connect Facebook Messenger</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Link your Facebook Page to enable AI-powered Messenger replies.
          </p>
          <div className="mt-4">
            <FacebookConnectButton
              businessId={businessId}
              portfolioAvailable={process.env.META_BUSINESS_MANAGEMENT === 'true'}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Connect Instagram</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Link the Instagram professional account attached to your Facebook Page. The same agent
            answers Direct messages and comments with your products and orders.
          </p>
          <div className="mt-4">
            <InstagramConnectButton businessId={businessId} />
          </div>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Requires an Instagram professional account linked to a Facebook Page. A personal
            Instagram account cannot be connected through the Meta API.
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Connected channels</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Each connected page replies to its customers with your {COMPANY_NAME} assistant, already trained on
          your products and orders. Disconnecting a page stops the replies and frees the page for
          another store.
        </p>
        <DataTable
          headers={channelHeaders}
          rows={channelRows}
          bulkDeleteAction={deleteChannelsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="channelIds"
          hasRowActions
        />
      </div>
    </>
  );
}
