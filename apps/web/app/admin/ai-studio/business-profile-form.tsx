'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { saveAdminBusinessProfile, type AdminBusinessProfile } from '@/lib/api';

const TEXT_FIELDS: Array<{ key: keyof AdminBusinessProfile; label: string }> = [
  { key: 'displayName', label: 'Display name' },
  { key: 'website', label: 'Website' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'socials', label: 'Socials' },
  { key: 'hoursHolidays', label: 'Hours & holidays' },
  { key: 'serviceAreas', label: 'Service areas' },
  { key: 'audience', label: 'Audience' },
  { key: 'limitations', label: 'Limitations' },
  { key: 'policies', label: 'Policies' },
  { key: 'pricingPackages', label: 'Pricing & packages' },
];

export function BusinessProfileForm({
  bearer,
  businessId,
  profile,
}: {
  bearer: string;
  businessId: string;
  profile: AdminBusinessProfile | null;
}) {
  const [state, setState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of TEXT_FIELDS) {
      initial[field.key] = (profile?.[field.key] as string | null) ?? '';
    }
    initial.description = profile?.description ?? '';
    return initial;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveAdminBusinessProfile(bearer, businessId, state);
      setStatus('Saved — the AI answers from this now.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Business profile</h2>
        <p className="text-sm text-muted-foreground">
          Only what a business actually is. Leave a field empty and the AI says it does not know
          instead of inventing it.
        </p>
      </div>

      <label className="space-y-1 text-sm">
        <span>Description</span>
        <Textarea
          rows={3}
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <label key={field.key} className="space-y-1 text-sm">
            <span>{field.label}</span>
            <Textarea
              rows={2}
              value={state[field.key] ?? ''}
              onChange={(e) => setState((s) => ({ ...s, [field.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </Card>
  );
}
