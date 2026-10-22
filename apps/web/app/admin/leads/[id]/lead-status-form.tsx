'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { updateAdminLead, type AdminLead } from '@/lib/api';

const STATUSES = [
  'new_lead',
  'qualifying',
  'qualified',
  'quoted',
  'booked',
  'awaiting_information',
  'waitlisted',
  'rejected',
  'junk',
] as const;

export function LeadStatusForm({ bearer, lead }: { bearer: string; lead: AdminLead }) {
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateAdminLead(bearer, lead.businessId, lead.id, {
        status,
        notes: notes || undefined,
      });
      setMessage('Saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Edit lead</h2>
      <label className="space-y-1 text-sm">
        <span>Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 sm:w-72"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>Notes</span>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </Card>
  );
}
