'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

type Option = {
  value: string;
  label: string;
};

type DropdownSelectProps = {
  options: Option[];
  defaultValue?: string;
  onChange?: (value: string) => void;
  showCalendarIcon?: boolean;
  className?: string;
  align?: 'left' | 'right';
};

export function DropdownSelect({
  options,
  defaultValue,
  onChange,
  showCalendarIcon,
  className,
  align = 'left',
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(
    options.find((o) => o.value === defaultValue) ?? options[0],
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (option: Option) => {
    setSelected(option);
    setIsOpen(false);
    if (onChange) onChange(option.value);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative flex h-10 items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]',
          showCalendarIcon && 'pl-9',
          className,
        )}
      >
        {showCalendarIcon && (
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
        <span>{selected?.label}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute mt-1.5 z-50 w-48 rounded-xl border border-border/80 bg-card p-1.5 shadow-lg shadow-black/5 animate-in fade-in duration-100',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          )}
        >
          <div className="space-y-0.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option)}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                  selected.value === option.value
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
