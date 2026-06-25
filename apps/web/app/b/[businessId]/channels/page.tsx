'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import {
  listChannels,
  listAgents,
  getFacebookAuthUrl,
  createAgent,
  updateChannelAgent,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

export default function ChannelsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [agentName, setAgentName] = useState('Sales Agent');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a friendly sales assistant. Help customers find products and place orders. Always confirm order details before creating an order.',
  );

  const { data: channels } = useQuery({
    queryKey: ['channels', businessId],
    queryFn: () => listChannels(token!, businessId),
    enabled: !!token,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', businessId],
    queryFn: () => listAgents(token!, businessId),
    enabled: !!token,
  });

  const fbChannel = channels?.find((c) => c.platform === 'facebook');

  return (
    <div>
      <h1 className="text-2xl font-bold">Channels</h1>
      <p className="text-[var(--muted-foreground)]">Connect Facebook Messenger to enable AI auto-replies.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Facebook Messenger</h2>
          {fbChannel ? (
            <div className="mt-4">
              <p className="text-sm text-green-600">Connected — Page ID: {fbChannel.platformChannelId}</p>
              <div className="mt-4">
                <label className="text-sm font-medium">Enable AI Agent</label>
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] p-2 text-sm"
                  value={fbChannel.agentId ?? ''}
                  onChange={async (e) => {
                    const agentId = e.target.value || null;
                    await updateChannelAgent(token!, businessId, fbChannel.id, agentId);
                    queryClient.invalidateQueries({ queryKey: ['channels', businessId] });
                  }}
                >
                  <option value="">Disabled</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <Button
              className="mt-4"
              onClick={async () => {
                const { url } = await getFacebookAuthUrl(token!, businessId);
                window.location.href = url;
              }}
            >
              Connect Facebook
            </Button>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">AI Agent Configuration</h2>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Agent name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
            <Textarea
              placeholder="System prompt"
              rows={5}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
            <Button
              onClick={async () => {
                await createAgent(token!, businessId, {
                  name: agentName,
                  systemPrompt,
                  platformType: 'facebook',
                });
                queryClient.invalidateQueries({ queryKey: ['agents', businessId] });
              }}
            >
              Create / Update Agent
            </Button>
          </div>
          {agents && agents.length > 0 && (
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
