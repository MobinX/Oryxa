'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Lock, ShoppingBag } from 'lucide-react';
import { ProductImage } from '@/components/storefront/product-image';
import { QuantityStepper } from '@/components/storefront/quantity-stepper';
import { useCart } from '@/components/storefront/cart-context';
import { checkout, formatPrice } from '@/lib/storefront';
import type { CheckoutResult } from '@/lib/storefront';
import { cn } from '@/lib/utils';

/** Only the identity of the store is needed here — never the whole catalog. */
export type CheckoutStore = { slug: string; name: string };

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'tel';
  required?: boolean;
  autoComplete?: string;
  multiline?: boolean;
};

export function CheckoutFlow({ store }: { store: CheckoutStore }) {
  const slug = store.slug;
  const { items, count, subtotal, ready, setQty, remove, clear } = useCart();

  const [customerName, setName] = useState('');
  const [customerPhone, setPhone] = useState('');
  const [customerAddress, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [placed, setPlaced] = useState<CheckoutResult | null>(null);

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || items.length === 0) return;

    if (customerName.trim().length < 2) {
      setFailure('Please tell the boutique who the order is for.');
      document.getElementById('customerName')?.focus();
      return;
    }

    setSubmitting(true);
    setFailure(null);
    try {
      const result = await checkout(slug, {
        customerName,
        customerPhone,
        customerAddress,
        items: items.map((line) => ({
          productId: line.productId,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          quantity: line.qty,
        })),
      });
      clear();
      setPlaced(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'We could not place your order. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <OrderConfirmation
        storeName={store.name}
        result={placed}
        name={customerName}
        slug={slug}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1560px] px-5 py-12 sm:px-8 md:py-16 lg:px-12">
      <header className="max-w-2xl">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--store-accent)]">
          {store.name}
        </p>
        <h1
          className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.02] tracking-[-0.02em] text-[var(--store-ink)]"
          style={{ fontFamily: 'var(--store-font)' }}
        >
          Checkout
        </h1>
        <p className="mt-5 text-[13.5px] leading-[1.8] text-[var(--store-ink-2)]">
          Leave your details and the boutique will confirm your order and arrange delivery. Payment
          is handled on delivery — online payment is coming soon.
        </p>
      </header>

      {!ready ? (
        <div className="mt-12 animate-pulse border border-[var(--store-line)] bg-[var(--store-surface)] px-6 py-16 text-center text-[11px] uppercase tracking-[0.26em] text-[var(--store-ink-3)]">
          Loading your bag
        </div>
      ) : items.length === 0 ? (
        <div className="mt-12 flex flex-col items-center border border-dashed border-[var(--store-line)] bg-[var(--store-surface)]/50 px-6 py-20 text-center">
          <ShoppingBag className="h-6 w-6 text-[var(--store-ink-3)]" strokeWidth={1.25} />
          <h2 className="mt-6 text-[11px] uppercase tracking-[0.28em] text-[var(--store-ink-2)]">
            Your bag is empty
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--store-ink-2)]">
            Add a piece from the collection and it will appear here, ready to check out.
          </p>
          <Link
            href={`/store/${slug}`}
            className="mt-8 inline-flex h-11 items-center gap-2 bg-[var(--store-accent)] px-8 text-[10.5px] uppercase tracking-[0.26em] text-[var(--store-accent-fg)] transition-opacity hover:opacity-90"
          >
            Browse the collection
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-x-16 gap-y-12 lg:grid-cols-12">
          {/* Details */}
          <form onSubmit={placeOrder} className="lg:col-span-7">
            <h2 className="text-[10px] uppercase tracking-[0.28em] text-[var(--store-ink-3)]">
              Contact &amp; delivery
            </h2>

            <div className="mt-8 space-y-9">
              <Field
                id="customerName"
                label="Full name"
                value={customerName}
                onChange={setName}
                required
                autoComplete="name"
                hint="Required — the name the order will be placed under."
              />
              <Field
                id="customerPhone"
                label="Phone"
                value={customerPhone}
                onChange={setPhone}
                type="tel"
                autoComplete="tel"
                hint="The boutique uses this to confirm your order."
              />
              <Field
                id="customerAddress"
                label="Delivery address"
                value={customerAddress}
                onChange={setAddress}
                autoComplete="street-address"
                multiline
                hint="Optional — you can also share it when the store calls you."
              />
            </div>

            {failure ? (
              <div
                role="alert"
                className="mt-10 border border-[#B91C1C]/25 bg-[rgba(185,28,28,0.04)] px-5 py-4 text-[12.5px] leading-relaxed text-[#8f2a24]"
              >
                {failure}
              </div>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'inline-flex h-12 min-w-[15rem] items-center justify-center gap-2.5',
                  'bg-[var(--store-accent)] text-[var(--store-accent-fg)]',
                  'text-[10.5px] uppercase tracking-[0.26em]',
                  'transition-all duration-300 hover:opacity-90 disabled:cursor-wait disabled:opacity-60',
                )}
              >
                {submitting ? 'Placing order' : 'Place order'}
                {!submitting ? (
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                ) : null}
              </button>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--store-ink-3)]">
                <Lock className="h-3 w-3" strokeWidth={1.5} />
                No card required
              </p>
            </div>
          </form>

          {/* Summary */}
          <aside className="lg:col-span-5">
            <div className="sticky top-28 border border-[var(--store-line)] bg-[var(--store-surface)]">
              <div className="flex items-baseline justify-between border-b border-[var(--store-line)] px-5 py-4 sm:px-6">
                <h2 className="text-[10px] uppercase tracking-[0.28em] text-[var(--store-ink-3)]">
                  Order summary
                </h2>
                <span className="text-[11px] tracking-[0.08em] text-[var(--store-ink-2)]">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </div>

              <ul className="divide-y divide-[var(--store-plate)] px-5 sm:px-6">
                {items.map((line) => (
                  <li key={line.key} className="flex gap-4 py-5">
                    <Link href={`/store/${slug}/${line.productId}`} className="w-[68px] shrink-0">
                      <ProductImage src={line.image} alt={line.name} className="aspect-[4/5] w-full" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-[13px] text-[var(--store-ink)]">{line.name}</p>
                        <p className="shrink-0 text-[13px] tabular-nums text-[var(--store-ink)]">
                          {formatPrice(line.price * line.qty)}
                        </p>
                      </div>
                      {line.variantName ? (
                        <p className="mt-1 truncate text-[11px] text-[var(--store-ink-2)]">{line.variantName}</p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <QuantityStepper
                          value={line.qty}
                          onChange={(next) => setQty(line.key, next)}
                          compact
                        />
                        <button
                          type="button"
                          onClick={() => remove(line.key)}
                          className="text-[10px] uppercase tracking-[0.2em] text-[var(--store-ink-3)] underline-offset-4 transition-colors hover:text-[var(--store-ink)] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-[var(--store-line)] px-5 py-5 sm:px-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[0.26em] text-[var(--store-ink-3)]">
                    Subtotal
                  </span>
                  <span
                    className="text-xl tabular-nums text-[var(--store-ink)]"
                    style={{ fontFamily: 'var(--store-font)' }}
                  >
                    {formatPrice(subtotal)}
                  </span>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--store-ink-3)]">
                  Shipping and taxes are agreed with the boutique at confirmation.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  type = 'text',
  required = false,
  autoComplete,
  multiline = false,
}: FieldProps) {
  const shared = cn(
    'w-full border-b bg-transparent pb-3 text-[14px] text-[var(--store-ink)] outline-none',
    'placeholder:text-[11px] placeholder:uppercase placeholder:tracking-[0.18em] placeholder:text-[var(--store-ink-3)]',
    'border-[var(--store-line)] transition-colors duration-300 focus:border-[var(--store-ink)]',
  );

  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.24em] text-[var(--store-ink-2)]"
      >
        <span>
          {label}
          {required ? <span className="ml-1 text-[var(--store-accent)]">*</span> : null}
        </span>
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className={cn(shared, 'mt-2 resize-none')}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={cn(shared, 'mt-2')}
        />
      )}
      {hint ? <p className="mt-2 text-[11px] text-[var(--store-ink-3)]">{hint}</p> : null}
    </div>
  );
}

function OrderConfirmation({
  storeName,
  result,
  name,
  slug,
}: {
  storeName: string;
  result: CheckoutResult;
  name: string;
  slug: string;
}) {
  const reference = result.orderIds[0] ?? '';
  const firstName = name.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="mx-auto w-full max-w-[52rem] px-5 py-20 sm:px-8 md:py-28">
      <div className="border border-[var(--store-line)] bg-[var(--store-surface)] px-6 py-14 text-center sm:px-14">
        <span className="mx-auto grid h-12 w-12 place-items-center border border-[var(--store-accent-line)] bg-[var(--store-accent-soft)] text-[var(--store-accent)]">
          <Check className="h-5 w-5" strokeWidth={1.5} />
        </span>

        <p className="mt-8 text-[10px] uppercase tracking-[0.3em] text-[var(--store-ink-3)]">
          Order received
        </p>
        <h1
          className="mt-5 text-[clamp(1.8rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.015em] text-[var(--store-ink)]"
          style={{ fontFamily: 'var(--store-font)' }}
        >
          Thank you{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mx-auto mt-5 max-w-[42ch] text-[13.5px] leading-[1.8] text-[var(--store-ink-2)]">
          {storeName} has your order and will be in touch to confirm the details and delivery.
        </p>

        <dl className="mx-auto mt-10 grid max-w-md gap-y-4 border-t border-[var(--store-plate)] pt-8 text-[12px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="uppercase tracking-[0.22em] text-[var(--store-ink-3)]">Total</dt>
            <dd className="text-lg tabular-nums text-[var(--store-ink)]">{formatPrice(result.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="uppercase tracking-[0.22em] text-[var(--store-ink-3)]">Reference</dt>
            <dd className="truncate font-mono text-[11px] tracking-[0.06em] text-[var(--store-ink-2)]">
              {reference ? reference.slice(0, 8).toUpperCase() : '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="uppercase tracking-[0.22em] text-[var(--store-ink-3)]">Status</dt>
            <dd className="uppercase tracking-[0.16em] text-[var(--store-accent)]">{result.status}</dd>
          </div>
          {result.orderIds.length > 1 ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="uppercase tracking-[0.22em] text-[var(--store-ink-3)]">Lines</dt>
              <dd className="tabular-nums text-[var(--store-ink-2)]">{result.orderIds.length} orders</dd>
            </div>
          ) : null}
        </dl>

        <p className="mx-auto mt-10 max-w-sm border border-dashed border-[var(--store-line)] px-4 py-3 text-[11px] leading-relaxed text-[var(--store-ink-2)]">
          Payment on delivery — secure online payment is coming soon.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/store/${slug}`}
            className="inline-flex h-11 items-center gap-2 bg-[var(--store-accent)] px-8 text-[10.5px] uppercase tracking-[0.26em] text-[var(--store-accent-fg)] transition-opacity hover:opacity-90"
          >
            Continue shopping
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}
