'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
};

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  className,
  compact = false,
}: QuantityStepperProps) {
  const step = (delta: number) => {
    const next = value + delta;
    if (next < min || next > max) return;
    onChange(next);
  };

  const buttonClass = cn(
    'grid place-items-center text-[#4a4a4a] transition-colors duration-200',
    'hover:bg-[#F4F2EE] hover:text-[var(--store-accent)]',
    'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
    compact ? 'h-8 w-8' : 'h-11 w-11',
  );

  return (
    <div
      className={cn(
        'inline-flex items-center border border-[#DFDCD6] bg-white',
        compact ? 'h-8' : 'h-11',
        className,
      )}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.5} />
      </button>
      <span
        aria-live="polite"
        className={cn(
          'grid place-items-center tabular-nums text-[#141414]',
          compact ? 'w-8 text-xs' : 'w-10 text-sm',
        )}
      >
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => step(1)}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.5} />
      </button>
    </div>
  );
}
