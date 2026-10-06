'use client';

import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type SearchBarProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search',
  size = 'sm',
  className,
}: SearchBarProps) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className={cn(
        'group flex items-center gap-2.5 border border-[var(--store-line)] bg-[var(--store-surface)]',
        'transition-colors duration-300 focus-within:border-[var(--store-ink)]',
        size === 'sm' ? 'h-9 px-3' : 'h-12 px-4',
        className,
      )}
    >
      <Search
        className={cn('shrink-0 text-[var(--store-ink-2)]', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        strokeWidth={1.5}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[var(--store-ink)] outline-none',
          'placeholder:text-[var(--store-ink-3)] placeholder:tracking-[0.16em] placeholder:uppercase placeholder:text-[10px]',
          '[appearance:textfield] [&::-webkit-search-cancel-button]:hidden',
          size === 'sm' ? 'text-[13px]' : 'text-sm',
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="shrink-0 text-[var(--store-ink-3)] transition-colors hover:text-[var(--store-ink)]"
        >
          <X className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.5} />
        </button>
      ) : null}
    </form>
  );
}
