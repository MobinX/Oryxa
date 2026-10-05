import { Select } from '@/components/ui/select';

type Customer = { id: string; name: string };

/**
 * Only rendered for a business whose owner has a company — the customer book is
 * the company's, so a merchant without one has nothing to pick and an empty
 * dropdown would read as a broken form rather than as a missing setup step.
 */
export function CustomerSelect({
  customers,
  defaultCustomerId,
}: {
  customers: Customer[];
  defaultCustomerId?: string | null;
}) {
  if (customers.length === 0) return null;

  return (
    <div className="sm:col-span-2">
      <label className="mb-1 block text-sm font-medium">Customer</label>
      <Select name="customerId" defaultValue={defaultCustomerId ?? ''}>
        <option value="">— No customer —</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Links this product to one of your company&apos;s customers.
      </p>
    </div>
  );
}
