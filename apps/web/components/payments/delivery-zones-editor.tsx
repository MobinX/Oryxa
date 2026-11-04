'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ZoneRow = { label: string; price: string };

const STARTERS: ZoneRow[] = [
  { label: 'Inside Dhaka', price: '' },
  { label: 'Outside Dhaka', price: '' },
];

export function DeliveryZonesEditor({
  action,
  initial,
}: {
  action: (formData: FormData) => void;
  initial: Array<{ label: string; price: number }>;
}) {
  const [zones, setZones] = useState<ZoneRow[]>(
    initial.length
      ? initial.map((zone) => ({ label: zone.label, price: String(zone.price) }))
      : STARTERS,
  );
  const [error, setError] = useState<string | null>(null);

  const payload = zones.map((zone) => ({
    label: zone.label.trim(),
    price: Number(zone.price),
  }));
  // Number('') is 0, so an untouched price box would save as free delivery. Guard on the text.
  const complete = zones.every(
    (zone, index) =>
      payload[index]!.label.length > 0 &&
      zone.price.trim().length > 0 &&
      Number.isFinite(payload[index]!.price) &&
      payload[index]!.price >= 0,
  );

  function update(index: number, patch: Partial<ZoneRow>) {
    setZones((current) =>
      current.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)),
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!complete) {
          event.preventDefault();
          setError('Every region needs a name and a price of 0 or more. Remove empty rows.');
          return;
        }
        setError(null);
      }}
      className="mt-4 space-y-3"
    >
      <input type="hidden" name="zones" value={JSON.stringify(payload)} />

      <div className="space-y-2">
        {zones.map((zone, index) => (
          <div key={index} className="flex items-start gap-2">
            <Input
              aria-label={`Region ${index + 1}`}
              placeholder="e.g. Inside Dhaka"
              value={zone.label}
              onChange={(event) => update(index, { label: event.target.value })}
              className="min-w-0 flex-1"
            />
            <div className="relative w-32 shrink-0">
              <Input
                aria-label={`Delivery price for ${zone.label || `region ${index + 1}`}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={zone.price}
                onChange={(event) => update(index, { price: event.target.value })}
                className="pr-12"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[var(--muted-foreground)]">
                BDT
              </span>
            </div>
            <button
              type="button"
              onClick={() => setZones((current) => current.filter((_, i) => i !== index))}
              aria-label={`Remove ${zone.label || `region ${index + 1}`}`}
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setZones((current) => [...current, { label: '', price: '' }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add region
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Prices are in BDT. The AI quotes the region that matches the customer’s address and
          passes that exact amount to the order. Remove every row to stop quoting delivery.
        </p>
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? 'Saving…' : 'Save delivery charges'}
    </Button>
  );
}
