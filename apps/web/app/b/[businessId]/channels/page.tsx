import { requireAuth } from '@/lib/auth';
import { listChannels, listAgents } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  connectFacebookAction,
  createAgentAction,
  updateChannelAgentAction,
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

  const fbChannel = channels.find((c) => c.platform === 'facebook');

  return (
    <div>
      <h1 className="text-2xl font-bold">Channels</h1>
      <p className="text-[var(--muted-foreground)]">
        Connect Facebook Messenger to enable AI auto-replies.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Facebook Messenger</h2>
          {fbChannel ? (
            <div className="mt-4">
              <p className="text-sm text-green-600">
                Connected — Page ID: {fbChannel.platformChannelId}
              </p>
              <form
                action={updateChannelAgentAction.bind(null, businessId, fbChannel.id)}
                className="mt-4 space-y-2"
              >
                <label className="text-sm font-medium">Enable AI Agent</label>
                <select
                  name="agentId"
                  defaultValue={fbChannel.agentId ?? ''}
                  className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
                >
                  <option value="">Disabled</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm">
                  Save agent
                </Button>
              </form>
            </div>
          ) : (
            <form action={connectFacebookAction.bind(null, businessId)}>
              <Button type="submit" className="mt-4">
                Connect Facebook
              </Button>
            </form>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">AI Agent Configuration</h2>
          <form action={createAgentAction.bind(null, businessId)} className="mt-4 space-y-3">
            <Input name="name" placeholder="Agent name" defaultValue="Sales Agent" />
            <Textarea
              name="systemPrompt"
              placeholder="System prompt"
              rows={5}
              defaultValue={DEFAULT_PROMPT}
            />
            <Button type="submit">Create agent</Button>
          </form>
          {agents.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {agents.map((a) => (
                <li key={a.id} className="rounded-lg bg-[var(--muted)] p-2">
                  <strong>{a.name}</strong> — {a.platformType}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
