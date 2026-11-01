'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PAYMENT_STRATEGY_OPTIONS } from '@/lib/payment-strategy';
import type { PaymentStrategy } from '@/lib/api';
import { cn } from '@/lib/utils';

export function PaymentStrategyEditor({
  action,
  initial,
}: {
  action: (formData: FormData) => void;
  initial: PaymentStrategy;
}) {
  const [selected, setSelected] = useState<PaymentStrategy>(initial);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="strategy" value={selected} />

      <div className="space-y-2" role="radiogroup" aria-label="Payment strategy">
        {PAYMENT_STRATEGY_OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                active
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] hover:bg-[var(--muted)]/60',
              )}
            >
              <input
                type="radio"
                name="strategy-choice"
                value={option.value}
                checked={active}
                onChange={() => setSelected(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="rounded-lg bg-[var(--muted)] px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
        This is the store default for every product. A product that needs a different rule can
        override it from its own edit form (Alter default payment strategy); the agent is alerted
        whenever a product overrides, and orders enforce the product rule, not this one.
      </p>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Prepaid strategies need at least one payment method above other than cash on delivery,
          and the transaction id is required before the order can be created.
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
      {pending ? 'Saving…' : 'Save payment strategy'}
    </Button>
  );
}
