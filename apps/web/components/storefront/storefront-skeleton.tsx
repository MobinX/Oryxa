import { cn } from '@/lib/utils';

function Bar({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-[var(--store-plate)]', className)} />;
}

/** Full-page placeholder shown while the store shell resolves. */
export function StorefrontSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--store-paper)] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-[1560px] items-center justify-between">
        <Bar className="h-4 w-32" />
        <Bar className="h-4 w-20" />
      </div>
      <div className="mx-auto mt-10 w-full max-w-[1560px] border border-[var(--store-line)] bg-[var(--store-surface)]">
        <div className="px-6 py-20 sm:py-28">
          <Bar className="h-2.5 w-24" />
          <Bar className="mt-6 h-10 w-full max-w-xl" />
          <Bar className="mt-4 h-3 w-full max-w-md" />
        </div>
      </div>
      <div className="mx-auto mt-16 grid w-full max-w-[1560px] grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <Bar className="aspect-[4/5] w-full" />
            <Bar className="mt-4 h-2.5 w-16" />
            <Bar className="mt-2.5 h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Two-column placeholder for the product detail page. */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1560px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:px-12">
      <div className="lg:col-span-7">
        <Bar className="aspect-[4/5] w-full" />
      </div>
      <div className="lg:col-span-5">
        <Bar className="h-2.5 w-24" />
        <Bar className="mt-6 h-8 w-3/4" />
        <Bar className="mt-4 h-3 w-20" />
        <Bar className="mt-10 h-3 w-full" />
        <Bar className="mt-3 h-3 w-5/6" />
        <Bar className="mt-12 h-11 w-full max-w-xs" />
      </div>
    </div>
  );
}

/** Form + summary placeholder for the checkout page. */
export function CheckoutSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1560px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:px-12">
      <div className="lg:col-span-7">
        <Bar className="h-2.5 w-28" />
        <Bar className="mt-10 h-9 w-full max-w-md" />
        <Bar className="mt-10 h-9 w-full max-w-md" />
        <Bar className="mt-10 h-20 w-full max-w-lg" />
        <Bar className="mt-12 h-12 w-full max-w-sm" />
      </div>
      <div className="lg:col-span-5">
        <Bar className="h-64 w-full" />
      </div>
    </div>
  );
}
