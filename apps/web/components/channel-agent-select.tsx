'use client';

import { useState, useTransition } from 'react';
import { updateChannelAgentAction } from '@/app/actions/channels';

interface ChannelAgentSelectProps {
  businessId: string;
  channelId: string;
  agentId: string | null;
  agents: Array<{ id: string; name: string }>;
}

export function ChannelAgentSelect({ businessId, channelId, agentId, agents }: ChannelAgentSelectProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(agentId ?? '');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('agentId', selectedAgentId);
      await updateChannelAgentAction(businessId, channelId, fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedAgentId}
        onChange={(e) => setSelectedAgentId(e.target.value)}
        disabled={isPending}
        className="h-8 w-40 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-60"
      >
        <option value="">Disabled</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:underline disabled:opacity-50 disabled:pointer-events-none min-w-[48px]"
      >
        {isPending ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            Saving
          </>
        ) : saved ? (
          <span className="text-green-600">✓ Saved</span>
        ) : (
          'Save'
        )}
      </button>
    </div>
  );
}
