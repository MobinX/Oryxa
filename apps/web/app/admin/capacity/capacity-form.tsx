'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { saveAdminCapacity, type AdminCapacity } from '@/lib/api';

const WAITLIST_MODES = ['off', 'auto', 'manual'] as const;

export function CapacityForm({ bearer, capacity }: { bearer: string; capacity: AdminCapacity }) {
  const [state, setState] = useState<AdminCapacity>(capacity);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  const field = (key: keyof AdminCapacity) => (value: string | boolean) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    startTransition(async () => {
      setSaving(true);
      try {
        const saved = await saveAdminCapacity(bearer, state.businessId, {
          acceptingNewCustomers: state.acceptingNewCustomers,
          maxCapacity: Number(state.maxCapacity),
          availableCapacity: Number(state.availableCapacity),
          waitlistMode: state.waitlistMode,
          fullCapacityMessage: state.fullCapacityMessage,
          followUpInfo: state.followUpInfo,
          preferredContact: state.preferredContact,
          etaText: state.etaText,
          notes: state.notes,
        });
        setState(saved);
        setStatus('Saved.');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Save failed.');
      } finally {
        setSaving(false);
      }
    });

  return (
    <Card className="space-y-4 p-5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.acceptingNewCustomers}
          onChange={(event) => field('acceptingNewCustomers')(event.target.checked)}
          className="h-4 w-4"
        />
        Accepting new customers — the AI may say yes to a new client
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Max capacity</span>
          <Input
            type="number"
            value={state.maxCapacity}
            min={0}
            onChange={(event) => field('maxCapacity')(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Slots available now</span>
          <Input
            type="number"
            value={state.availableCapacity}
            min={0}
            onChange={(event) => field('availableCapacity')(event.target.value)}
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span>Waitlist mode</span>
        <select
          value={state.waitlistMode}
          onChange={(event) => field('waitlistMode')(event.target.value as AdminCapacity['waitlistMode'])}
          className="w-full rounded-md border border-border bg-card px-3 py-2"
        >
          {WAITLIST_MODES.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span>Message to send when the store is full</span>
        <Textarea
          rows={3}
          value={state.fullCapacityMessage ?? ''}
          onChange={(event) => field('fullCapacityMessage')(event.target.value)}
          placeholder="We're currently at capacity — can I put you on the waitlist?"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span>When the store can take new work (ETA wording)</span>
        <Input
          value={state.etaText ?? ''}
          onChange={(event) => field('etaText')(event.target.value)}
          placeholder="Usually within two weeks"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span>Preferred contact method for new customers</span>
        <Input
          value={state.preferredContact ?? ''}
          onChange={(event) => field('preferredContact')(event.target.value)}
          placeholder="phone"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span>Follow-up / other info the AI may share</span>
        <Textarea
          rows={2}
          value={state.followUpInfo ?? ''}
          onChange={(event) => field('followUpInfo')(event.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || saving}>
          {saving ? 'Saving…' : 'Save capacity'}
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </Card>
  );
}
