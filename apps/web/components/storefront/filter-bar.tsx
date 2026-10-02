'use client';

import { ChevronDown } from 'lucide-react';
import { SearchBar } from '@/components/storefront/search-bar';
import type { ProductSort, StoreFilterState } from '@/lib/storefront';
import { cn } from '@/lib/utils';

export type { StoreFilterState };

type FilterBarProps = {
  categories: string[];
  filters: StoreFilterState;
  onChange: (patch: Partial<StoreFilterState>) => void;
  onCommit: () => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  loading?: boolean;
};

const SORT_LABELS: Record<ProductSort, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

export function FilterBar({
  categories,
  filters,
  onChange,
  onCommit,
  onClear,
  resultCount,
  totalCount,
  loading = false,
}: FilterBarProps) {
  const filtered =
    Boolean(filters.q.trim()) ||
    Boolean(filters.category) ||
    filters.sort !== 'newest' ||
    filters.min !== '' ||
    filters.max !== '';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCommit();
      }}
      className="border-y border-[#E4E1DB] bg-[#FBFAF8]/60"
    >
      <div className="mx-auto w-full max-w-[1560px] px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          {/* Category chips — horizontally scrollable on small screens */}
          {categories.length > 0 ? (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [&::-webkit-scrollbar]:hidden xl:mx-0 xl:flex-wrap xl:px-0 xl:pb-0">
              <Chip active={!filters.category} onClick={() => onChange({ category: '' })}>
                All
              </Chip>
              {categories.map((category) => (
                <Chip
                  key={category}
                  active={filters.category === category}
                  onClick={() => onChange({ category: filters.category === category ? '' : category })}
                >
                  {category}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#a29d96]">Browse the collection</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              value={filters.q}
              onChange={(q) => onChange({ q })}
              onSubmit={onCommit}
              placeholder="Search"
              className="w-full sm:w-56"
            />

            <div className="flex items-center gap-1.5 border border-[#DFDCD6] bg-white px-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#a29d96]">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={filters.min}
                onChange={(event) => onChange({ min: event.target.value })}
                placeholder="Min"
                aria-label="Minimum price"
                className="h-9 w-14 bg-transparent text-[12px] text-[#141414] outline-none placeholder:text-[#b7b2aa] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[#c9c5be]">–</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={filters.max}
                onChange={(event) => onChange({ max: event.target.value })}
                placeholder="Max"
                aria-label="Maximum price"
                className="h-9 w-14 bg-transparent text-[12px] text-[#141414] outline-none placeholder:text-[#b7b2aa] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <div className="relative">
              <select
                value={filters.sort}
                onChange={(event) => onChange({ sort: event.target.value as ProductSort })}
                aria-label="Sort products"
                className={cn(
                  'h-9 appearance-none border border-[#DFDCD6] bg-white pl-3 pr-8',
                  'text-[11px] uppercase tracking-[0.16em] text-[#3d3d3d] outline-none',
                  'transition-colors duration-300 hover:border-[#141414] focus:border-[#141414]',
                )}
              >
                {(Object.keys(SORT_LABELS) as ProductSort[]).map((value) => (
                  <option key={value} value={value}>
                    {SORT_LABELS[value]}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8f8b85]"
                strokeWidth={1.5}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-[#8f8b85]">
          <span className={cn('transition-opacity duration-300', loading && 'opacity-40')}>
            {resultCount} {resultCount === 1 ? 'piece' : 'pieces'}
            {filtered ? ` of ${totalCount}` : ''}
          </span>
          {filtered ? (
            <button
              type="button"
              onClick={onClear}
              className="border-b border-transparent text-[#141414] transition-colors hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap border px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em]',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        active
          ? 'border-[var(--store-accent-line)] bg-[var(--store-accent-soft)] text-[var(--store-accent)]'
          : 'border-[#DFDCD6] bg-white text-[#6b6b6b] hover:border-[#141414] hover:text-[#141414]',
      )}
    >
      {children}
    </button>
  );
}
