import { requireAuth } from '@/lib/auth';
import { listChannels, listAgents, type Channel, type Agent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/data-table';
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

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [channels, agents] = await Promise.all([
    listChannels(token, businessId),
    listAgents(token, businessId),
  ]);

  const channelColumns: Column<Channel>[] = [
    { key: 'platform', header: 'Platform', render: (c) => <span className="font-medium capitalize">{c.platform}</span> },
    { key: 'platformChannelId', header: 'Page/Channel ID', render: (c) => <span className="text-[var(--muted-foreground)]">{c.platformChannelId}</span> },
    {
      key: 'agentId',
      header: 'Agent',
      render: (c) => (
        <form action={updateChannelAgentAction.bind(null, businessId, c.id)} className="flex items-center gap-2">
          <Select name="agentId" defaultValue={c.agentId ?? ''} className="h-8 w-40 text-sm">
            <option value="">Disabled</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <button type="submit" className="text-xs text-[var(--primary)] hover:underline">
            Save
          </button>
        </form>
      ),
    },
  ];

  const agentColumns: Column<Agent>[] = [
    { key: 'name', header: 'Name', render: (a) => <span className="font-medium">{a.name}</span> },
    { key: 'platformType', header: 'Platform', className: 'capitalize' },
    {
      key: 'systemPrompt',
      header: 'Prompt',
      className: 'hidden md:table-cell',
      render: (a) => <span className="line-clamp-1 max-w-xs text-[var(--muted-foreground)]">{a.systemPrompt}</span>,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Channels</h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Connect messaging platforms and bind AI agents.
        </p>
      </div>

      {/* Connect new channel */}
      <Card>
        <h2 className="text-lg font-semibold">Connect Facebook Messenger</h2>
        <form action={connectFacebookAction.bind(null, businessId)} className="mt-4">
          <Button type="submit" className="w-full sm:w-auto">Connect Facebook</Button>
        </form>
      </Card>

      {/* Channels table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Connected channels</h2>
        <DataTable
          rows={channels}
          getRowId={(c) => c.id}
          columns={channelColumns}
          bulkDeleteAction={deleteChannelsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="channelIds"
          hasRowActions
          rowActions={(c) => (
            <form action={deleteChannelAction.bind(null, businessId, c.id)}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </form>
          )}
        />
      </div>

      {/* Create agent */}
      <Card>
        <h2 className="text-lg font-semibold">Create AI agent</h2>
        <form action={createAgentAction.bind(null, businessId)} className="mt-4 space-y-3">
          <Input name="name" placeholder="Agent name" defaultValue="Sales Agent" />
          <Textarea name="systemPrompt" placeholder="System prompt" rows={5} defaultValue={DEFAULT_PROMPT} />
          <Button type="submit" className="w-full sm:w-auto">Create agent</Button>
        </form>
      </Card>

      {/* Agents table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">AI Agents</h2>
        <DataTable
          rows={agents}
          getRowId={(a) => a.id}
          columns={agentColumns}
          bulkDeleteAction={deleteAgentsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="agentIds"
          hasRowActions
          rowActions={(a) => (
            <>
              <form action={updateAgentAction.bind(null, businessId, a.id)} className="flex items-center gap-2">
                <Input name="name" defaultValue={a.name} className="h-8 w-28 text-sm" />
                <button type="submit" className="text-sm text-[var(--primary)] hover:underline">
                  Save
                </button>
              </form>
              <form action={deleteAgentAction.bind(null, businessId, a.id)}>
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </>
          )}
        />
      </div>
    </div>
  );
}
