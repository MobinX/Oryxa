import { Check, Trash2 } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listChannels, listAgents, type Channel, type Agent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableHeader } from '@/components/data-table';
import {
  connectFacebookAction,
  createAgentAction,
  updateAgentAction,
  deleteAgentAction,
  deleteAgentsBulkAction,
  updateChannelAgentAction,
  deleteChannelAction,
  deleteChannelsBulkAction,
} from '@/app/actions/channels';

const DEFAULT_PROMPT =
  'You are a friendly sales assistant. Help customers find products and place orders. Always confirm order details before creating an order.';

const channelHeaders: DataTableHeader[] = [
  { key: 'platform', header: 'Platform', className: 'min-w-[100px]' },
  { key: 'pageName', header: 'Page name', className: 'w-full min-w-[140px]' },
  { key: 'platformChannelId', header: 'Page ID', className: 'hidden sm:table-cell' },
  { key: 'agentId', header: 'Agent' },
];

const agentHeaders: DataTableHeader[] = [
  { key: 'name', header: 'Name', className: 'w-full min-w-[120px]' },
  { key: 'platformType', header: 'Platform', className: 'capitalize' },
  { key: 'systemPrompt', header: 'Prompt', className: 'hidden md:table-cell' },
];

export default async function ChannelsPage({
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
  const [channels, agents] = await Promise.all([
    listChannels(token, businessId),
    listAgents(token, businessId),
  ]);

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
      <form
        key="agentId"
        action={updateChannelAgentAction.bind(null, businessId, channel.id)}
        className="flex items-center gap-2"
      >
        <Select name="agentId" defaultValue={channel.agentId ?? ''} className="h-8 w-40 text-sm">
          <option value="">Disabled</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <button type="submit" className="text-xs text-[var(--primary)] hover:underline">
          Save
        </button>
      </form>,
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

  const agentRows = agents.map((agent: Agent) => ({
    id: agent.id,
    cells: [
      <span key="name" className="font-medium">
        {agent.name}
      </span>,
      agent.platformType,
      <span key="systemPrompt" className="line-clamp-1 max-w-xs text-[var(--muted-foreground)]">
        {agent.systemPrompt}
      </span>,
    ],
    actions: (
      <>
        <form action={updateAgentAction.bind(null, businessId, agent.id)} className="flex items-center gap-2">
          <Input name="name" defaultValue={agent.name} className="h-8 w-28 text-sm" />
          <button
            type="submit"
            className="inline-flex items-center justify-center text-sm text-[var(--primary)] hover:underline font-semibold"
            title="Save"
          >
            <Check className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </form>
        <form action={deleteAgentAction.bind(null, businessId, agent.id)}>
          <button
            type="submit"
            className="inline-flex items-center justify-center text-sm text-red-600 hover:underline font-semibold"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </form>
      </>
    ),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Channels</h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Connect messaging platforms and bind AI agents.
        </p>
      </div>

      {connected === 'facebook' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Facebook page(s) connected successfully.
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

      {error === 'facebook-subscribe' && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Facebook connect failed.
          {detail && <span className="mt-1 block text-xs opacity-90">{decodeURIComponent(detail)}</span>}
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold">Connect Facebook Messenger</h2>
        <form action={connectFacebookAction.bind(null, businessId)} className="mt-4">
          <Button type="submit" className="w-full sm:w-auto">
            Connect Facebook
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Connected channels</h2>
        <DataTable
          headers={channelHeaders}
          rows={channelRows}
          bulkDeleteAction={deleteChannelsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="channelIds"
          hasRowActions
        />
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Create AI agent</h2>
        <form action={createAgentAction.bind(null, businessId)} className="mt-4 space-y-3">
          <Input name="name" placeholder="Agent name" defaultValue="Sales Agent" />
          <Textarea name="systemPrompt" placeholder="System prompt" rows={5} defaultValue={DEFAULT_PROMPT} />
          <Button type="submit" className="w-full sm:w-auto">
            Create agent
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">AI Agents</h2>
        <DataTable
          headers={agentHeaders}
          rows={agentRows}
          bulkDeleteAction={deleteAgentsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="agentIds"
          hasRowActions
        />
      </div>
    </div>
  );
}
