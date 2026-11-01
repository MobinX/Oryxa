'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { makeVariantId, slugify } from '@repo/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { VariantPhotoDialog } from '@/components/products/variant-photo-dialog';
import { CategorySelect } from '@/components/products/category-select';
import { CustomerSelect } from '@/components/products/customer-select';
import { ProductFormSubmit } from '@/components/products/product-form-submit';
import type { UploadedImage } from '@/lib/uploads-client';

/** A variant holds as many shots as a merchant has; past this the strip is a gallery nobody scrolls. */
const MAX_IMAGES = 8;
/** A product is sold in at most three knobs — Color, Size, Material — by declaration. */
const MAX_OPTIONS = 3;
const MAX_OPTION_VALUES = 50;

export interface WizardOption {
  name: string;
  values: string[];
}

export interface WizardVariantImage {
  key: string;
  previewUrl: string | null;
}

export interface WizardVariant {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  variantId: string | null;
  hadImages: boolean;
  images: WizardVariantImage[];
  options: Record<string, string>;
}

export interface ProductWizardInitial {
  name?: string;
  price?: string;
  currency?: string;
  sku?: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  customerId?: string | null;
  slug?: string;
  hasDiscount?: boolean;
  discountPercent?: number;
  tags?: string[];
  showInStorefront?: boolean;
  options?: WizardOption[];
  variants?: Array<{
    id?: string;
    name: string;
    stock: number;
    price?: number;
    variantId?: string | null;
    images?: Array<{ key: string; previewUrl?: string | null }>;
    imageKey?: string | null;
    options?: Record<string, string>;
  }>;
}

type CategoryOption = { id: string; name: string };

function initialImages(row: NonNullable<ProductWizardInitial['variants']>[number]): WizardVariantImage[] {
  const shots =
    row.images ?? (row.imageKey ? [{ key: row.imageKey, previewUrl: null }] : []);
  return shots.map((shot) => ({ key: shot.key, previewUrl: shot.previewUrl ?? null }));
}

function blankVariant(): WizardVariant {
  return {
    name: '',
    stock: 0,
    variantId: null,
    hadImages: false,
    images: [],
    options: {},
  };
}

/**
 * The two-step product form.
 *
 * Step one is the product itself — what it is, what it costs by default, how it is discounted,
 * how it is tagged, where it shows — plus the dedicated options builder, because declaring
 * "Color: blue/red" is a decision about the product, not about any one row of it.
 *
 * Step two is the shelf: one row per variant. When options were declared, every row must answer
 * each option with one of its values — that combination is what the row *is*, and it names the
 * row on the server, so the matrix and the stored name can never disagree. Rows also carry their
 * own pictures, an optional price override, and a stock count; the five-character short id is
 * rolled in the browser and stamped on every picture, and is never editable.
 *
 * Both steps stay mounted and the inactive one hides with CSS, so the browser submits the whole
 * form to the server action no matter which step the merchant is looking at.
 */
export function ProductWizard({
  businessId,
  action,
  categories,
  customers = [],
  hasCompany = true,
  initial,
  submitLabel,
  savingLabel,
  cancelHref,
}: {
  businessId: string;
  action: (formData: FormData) => void;
  categories: CategoryOption[];
  customers?: Array<{ id: string; name: string }>;
  hasCompany?: boolean;
  initial?: ProductWizardInitial;
  submitLabel: string;
  savingLabel: string;
  cancelHref: string;
}) {
  const hasInitialOptions = (initial?.options?.length ?? 0) > 0;
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  // Step one
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'BDT');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [hasDiscount, setHasDiscount] = useState(initial?.hasDiscount ?? false);
  const [discountPercent, setDiscountPercent] = useState(
    initial?.discountPercent != null && initial.discountPercent > 0 ? String(initial.discountPercent) : '',
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [showInStorefront, setShowInStorefront] = useState(initial?.showInStorefront ?? true);
  const [options, setOptions] = useState<WizardOption[]>(initial?.options ?? []);
  const [optionDrafts, setOptionDrafts] = useState<Record<number, string>>({});

  // Step two
  const [variants, setVariants] = useState<WizardVariant[]>(
    initial?.variants?.length
      ? initial.variants.map((v) => ({
          id: v.id,
          name: v.name,
          stock: v.stock,
          price: v.price,
          // An unsaved row gets its label only after mount: the label is random, and random
          // values rendered during SSR hydrate into a tree React has to throw away.
          variantId: v.variantId ?? null,
          hadImages: (v.images?.length ?? 0) > 0 || Boolean(v.imageKey),
          images: initialImages(v),
          options: v.options ?? {},
        }))
      : [blankVariant()],
  );
  const [counter, setCounter] = useState(initial?.variants?.length ?? 1);
  const [dialog, setDialog] = useState<{ idx: number; files: File[] } | null>(null);
  const fileInputRefs = useRef<Map<number, HTMLInputElement | null>>(new Map());

  // Labels for unsaved rows are rolled after mount, for the same reason the initial rows start
  // without one: nothing random may exist on the server-rendered tree.
  useEffect(() => {
    setVariants((prev) => prev.map((v) => (v.variantId ? v : { ...v, variantId: makeVariantId() })));
  }, []);

  const nameTouched = name.trim().length > 0;
  const priceValue = parseFloat(price);
  const hasOptions = options.length > 0;

  /** Combinations already taken, keyed by the joined values — the duplicate check reads this. */
  const combinationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!hasOptions) return counts;
    for (const variant of variants) {
      const combination = options.map((o) => variant.options[o.name] ?? '').join(' / ');
      counts.set(combination, (counts.get(combination) ?? 0) + 1);
    }
    return counts;
  }, [variants, options, hasOptions]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, { name: '', values: [] }]);
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
  }

  function addOptionValue(index: number) {
    const raw = (optionDrafts[index] ?? '').trim();
    if (!raw) return;
    const option = options[index]!;
    if (option.values.some((v) => v.toLowerCase() === raw.toLowerCase())) {
      setOptionDrafts({ ...optionDrafts, [index]: '' });
      return;
    }
    if (option.values.length >= MAX_OPTION_VALUES) return;
    const next = [...options];
    next[index] = { ...option, values: [...option.values, raw] };
    setOptions(next);
    setOptionDrafts({ ...optionDrafts, [index]: '' });
  }

  function removeOptionValue(optionIndex: number, valueIndex: number) {
    const option = options[optionIndex]!;
    const next = [...options];
    next[optionIndex] = { ...option, values: option.values.filter((_, i) => i !== valueIndex) };
    setOptions(next);
  }

  function addVariantRow() {
    const previous = variants[variants.length - 1];
    setVariants([
      ...variants,
      {
        ...blankVariant(),
        // A new row starts from the previous one's combination, because the common case is
        // "the same thing in the next size", and five selects re-chosen by hand is friction.
        // The label rolls here and now: this row was born in the browser, after mount.
        variantId: makeVariantId(),
        options: previous && hasOptions ? { ...previous.options } : {},
        price: previous?.price,
      },
    ]);
    setCounter((c) => c + 1);
  }

  function removeVariantRow(index: number) {
    setVariants((prev) => {
      prev[index]?.images.forEach((img) => {
        if (img.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
      });
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeImage(index: number, imageKey: string) {
    setVariants((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const target = row.images.find((img) => img.key === imageKey);
        if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
        return { ...row, images: row.images.filter((img) => img.key !== imageKey) };
      }),
    );
  }

  function onPickImages(index: number, files: File[]) {
    const input = fileInputRefs.current.get(index);
    if (input) input.value = '';
    if (files.length === 0) return;
    const row = variants[index];
    if (!row) return;
    const queue = files.slice(0, Math.max(0, MAX_IMAGES - row.images.length));
    if (queue.length === 0) return;
    setDialog({ idx: index, files: queue });
  }

  function onStored(index: number, image: UploadedImage) {
    setVariants((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, images: [...row.images, { key: image.key, previewUrl: image.previewUrl }] }
          : row,
      ),
    );
    setDialog((current) => (current && current.idx === index ? { ...current, files: current.files.slice(1) } : current));
  }

  /** Everything the browser would otherwise only say after the action had already run. */
  /** What step one owes: the product fields, and options that are fully declared. */
  function validateStepOne(): string | null {
    if (!name.trim()) return 'The product needs a name.';
    if (!(parseFloat(price) > 0)) return 'The product needs a default price.';
    if (!sku.trim()) return 'The product needs a SKU.';
    if (hasOptions) {
      if (options.some((o) => !o.name.trim())) return 'Every option needs a name.';
      if (options.some((o) => o.values.length === 0)) return 'Every option needs at least one value.';
    }
    if (hasDiscount && !(parseFloat(discountPercent) >= 0 && parseFloat(discountPercent) <= 100)) {
      return 'The discount has to be between 0 and 100 percent.';
    }
    return null;
  }

  /** What step two owes: every variant a full combination, and no combination twice. */
  function validateStepTwo(): string | null {
    if (!hasOptions) return null;

    for (const [i, variant] of variants.entries()) {
      for (const option of options) {
        if (!variant.options[option.name]) {
          return `Variant ${i + 1} must choose a ${option.name}.`;
        }
      }
    }
    for (const [combination, count] of combinationCounts) {
      if (count > 1) return `Two variants carry the same combination: ${combination || '(empty)'}`;
    }
    return null;
  }

  function goToStepTwo() {
    // Step one's checks only: the variants have not been touched yet, and their own rules are
    // what the final submit enforces.
    const problem = validateStepOne();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep(2);
  }

  function onSubmitGuard(event: React.FormEvent<HTMLFormElement>) {
    const problem = validateStepOne() ?? validateStepTwo();
    if (problem) {
      event.preventDefault();
      setError(problem);
      setStep(problem.startsWith('Variant') || problem.startsWith('Two variants') ? 2 : 1);
    }
  }

  return (
    <form action={action} onSubmit={onSubmitGuard} className="mt-6 space-y-4">
      {/* ── Step 1 — the product, and the knobs it is sold in ─────────────────── */}
      <div className={cn('space-y-4', step !== 1 && 'hidden')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Product name</label>
            <Input name="name" value={name} onChange={(e) => onNameChange(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Default price</label>
            <div className="flex gap-2">
              <Input
                name="price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="min-w-0 flex-1"
                required
              />
              <select
                name="currency"
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 w-24 shrink-0 rounded-lg border border-[var(--border)] bg-white px-2 text-sm font-medium dark:bg-slate-900"
              >
                {['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'MYR', 'PKR', 'LKR', 'NPR'].map(
                  (code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ),
                )}
              </select>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              What a variant without its own price override costs, quoted in this currency.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">SKU</label>
            <Input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional product description"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Discount</label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasDiscount}
                onChange={(e) => setHasDiscount(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              This product has a discount
            </label>
            <input type="hidden" name="hasDiscount" value={hasDiscount ? '1' : '0'} />
            {hasDiscount ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  name="discountPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="0"
                  className="w-28"
                />
                <span className="text-sm text-[var(--muted-foreground)]">% off the default price</span>
              </div>
            ) : (
              <input type="hidden" name="discountPercent" value="0" />
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <Input
              name="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="saree, wedding, cotton — separated by commas"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Comma-separated.</p>
          </div>
          <div className="sm:col-span-2">
            <CategorySelect
              categories={categories}
              defaultCategoryId={initial?.categoryId || undefined}
            />
          </div>
          {hasCompany && (
            <div className="sm:col-span-2">
              <CustomerSelect
                customers={customers}
                defaultCustomerId={initial?.customerId || undefined}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Show in storefront</label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showInStorefront}
                onChange={(e) => setShowInStorefront(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              This product appears on the public store
            </label>
            <input type="hidden" name="showInStorefront" value={showInStorefront ? '1' : '0'} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">URL slug</label>
            <Input
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="auto-generated from the name"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              The storefront address of this product: /store/{'<slug>'}. Left empty, it folds from the name.
            </p>
          </div>
        </div>

        {/* ── Options builder ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/80 bg-card p-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div>
              <label className="text-sm font-semibold font-geist text-foreground">Options</label>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                The ways this product varies — Color, Size, Material. Up to {MAX_OPTIONS}. Optional:
                without any, step two is a plain list of variants.
              </p>
            </div>
            {options.length < MAX_OPTIONS ? (
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Add option
              </button>
            ) : (
              <span className="text-xs font-semibold text-muted-foreground">{MAX_OPTIONS} of {MAX_OPTIONS}</span>
            )}
          </div>

          {options.length === 0 ? (
            <p className="pt-3 text-xs text-[var(--muted-foreground)]">
              No options declared. Every variant in step two will be a free-named row with its own stock and photo.
            </p>
          ) : (
            <div className="space-y-3 pt-3">
              {options.map((option, index) => (
                <div key={index} className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={option.name}
                      onChange={(e) => {
                        const next = [...options];
                        next[index] = { ...option, name: e.target.value };
                        setOptions(next);
                      }}
                      placeholder={`Option ${index + 1} — e.g. ${['Color', 'Size', 'Material'][index] ?? 'Option'}`}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => removeOption(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {option.values.map((value, valueIndex) => (
                      <span
                        key={`${value}-${valueIndex}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium"
                      >
                        {value}
                        <button
                          type="button"
                          aria-label={`Remove value ${value}`}
                          onClick={() => removeOptionValue(index, valueIndex)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <div className="inline-flex items-center gap-1">
                      <Input
                        value={optionDrafts[index] ?? ''}
                        onChange={(e) => setOptionDrafts({ ...optionDrafts, [index]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addOptionValue(index);
                          }
                        }}
                        placeholder={option.values.length === 0 ? 'e.g. Red' : 'Add a value…'}
                        className="h-8 w-36"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addOptionValue(index)}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Step 2 — the shelf: one row per variant ──────────────────────────── */}
      <div className={cn('space-y-3', step !== 2 && 'hidden')}>
        <div className="border-b border-border/40 pb-2">
          <label className="text-sm font-semibold font-geist text-foreground">Variants</label>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {hasOptions
              ? 'Every variant answers every option declared in step one — that combination is the row. Each row carries its own pictures, an optional price override (the default price otherwise) and a stock count. The short id is rolled for you and never editable.'
              : 'Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically. A variant holds up to ' + MAX_IMAGES + ' pictures and the first is the one shown on the shelf. Each picture is stamped with the variant\u2019s short id before it is stored, so a customer who sends that photo back can be read off it.'}
          </p>
        </div>

        {variants.map((variant, i) => {
          const keys = variant.images.map((img) => img.key);
          const emptied = variant.hadImages && keys.length === 0;
          const full = keys.length >= MAX_IMAGES;
          const combination = options.map((o) => variant.options[o.name] ?? '').join(' / ');
          const duplicate = hasOptions && (combinationCounts.get(combination) ?? 0) > 1;

          return (
            <div key={i} className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  Variant #{i + 1}
                  {variant.variantId && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-foreground" title="Auto-generated — not editable">
                      #{variant.variantId}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeVariantRow(i)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>

              {variant.id && <input type="hidden" name={`variant_${i}_id`} value={variant.id} />}
              {variant.variantId && (
                <input type="hidden" name={`variant_${i}_variantId`} value={variant.variantId} />
              )}
              {keys.map((key) => (
                <input key={key} type="hidden" name={`variant_${i}_imageKey`} value={key} />
              ))}
              {emptied && <input type="hidden" name={`variant_${i}_clearImage`} value="1" />}
              <input
                type="hidden"
                name={`variant_${i}_options`}
                value={JSON.stringify(
                  Object.fromEntries(options.map((o) => [o.name, variant.options[o.name] ?? ''])),
                )}
              />
              {/* On a product sold in combinations the server names the row from the combination;
                  the hidden name keeps the plain parser working either way. */}
              <input
                type="hidden"
                name={`variant_${i}_name`}
                value={hasOptions ? combination : variant.name}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {hasOptions ? (
                  options.map((option) => (
                    <label key={option.name} className="block space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">{option.name}</span>
                      <Select
                        value={variant.options[option.name] ?? ''}
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...variant, options: { ...variant.options, [option.name]: e.target.value } };
                          setVariants(next);
                        }}
                      >
                        <option value="">Choose {option.name}…</option>
                        {option.values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))
                ) : (
                  <Input
                    name={`variant_${i}_name_visible`}
                    placeholder="Variant name"
                    value={variant.name}
                    onChange={(e) => {
                      const next = [...variants];
                      next[i] = { ...variant, name: e.target.value };
                      setVariants(next);
                    }}
                  />
                )}
                <Input
                  name={`variant_${i}_stock`}
                  type="number"
                  min="0"
                  placeholder="Stock"
                  value={String(variant.stock ?? 0)}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...variant, stock: parseInt(e.target.value) || 0 };
                    setVariants(next);
                  }}
                />
                <Input
                  name={`variant_${i}_price`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price override (uses the default price)"
                  value={variant.price != null ? String(variant.price) : ''}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...variant, price: e.target.value === '' ? undefined : parseFloat(e.target.value) };
                    setVariants(next);
                  }}
                />
                <label
                  className={cn(
                    'inline-flex h-10 cursor-pointer items-center justify-center rounded-element border border-dashed border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors',
                    full && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="truncate">
                    {full
                      ? `${MAX_IMAGES} of ${MAX_IMAGES} pictures`
                      : keys.length > 0
                        ? 'Add pictures'
                        : 'Upload pictures'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    aria-label={`Variant ${i + 1} pictures`}
                    disabled={full}
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(i, el);
                      else fileInputRefs.current.delete(i);
                    }}
                    onChange={(e) => onPickImages(i, Array.from(e.target.files ?? []))}
                  />
                </label>
              </div>

              {duplicate && (
                <p className="text-xs font-semibold text-destructive">
                  Another variant already has this combination — change a value or remove this row.
                </p>
              )}

              {variant.images.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {variant.images.map((img, position) => (
                    <div key={img.key} className="space-y-1">
                      <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-muted">
                        {img.previewUrl && (
                          <img
                            src={img.previewUrl}
                            alt={`${variant.name || 'variant'} — picture ${position + 1}`}
                            className="h-full w-full object-cover"
                          />
                        )}
                        {position === 0 && (
                          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Cover
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(i, img.key)}
                          aria-label={`Remove picture ${position + 1}`}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addVariantRow}
          className="w-full border-dashed border-border text-muted-foreground hover:text-foreground"
        >
          + Add another variant
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <a href={cancelHref} className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
          Cancel
        </a>
        {step === 1 ? (
          <Button type="button" onClick={goToStepTwo}>
            Next: variants →
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            ← Back to product
          </Button>
        )}
        {step === 2 ? <ProductFormSubmit label={submitLabel} saving={savingLabel} /> : null}
      </div>

      {dialog && dialog.files.length > 0 && (
        <VariantPhotoDialog
          businessId={businessId}
          file={dialog.files[0]}
          label={variants[dialog.idx]?.variantId ?? null}
          remaining={dialog.files.length - 1}
          onUploaded={(image) => onStored(dialog.idx, image)}
          onCancel={() => setDialog(null)}
        />
      )}
    </form>
  );
}
