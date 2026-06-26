import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type Category = { id: string; name: string };

export function CategorySelect({
  categories,
  defaultCategoryId,
}: {
  categories: Category[];
  defaultCategoryId?: string;
}) {
  return (
    <div className="space-y-3">
      {categories.length > 0 ? (
        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <Select name="categoryId" defaultValue={defaultCategoryId ?? ''}>
            <option value="">Choose existing category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No categories yet — create one below.</p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {categories.length > 0 ? 'Or new category name' : 'Category name'}
        </label>
        <Input name="categoryName" placeholder="e.g. Clothing, Electronics" />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Used only when no existing category is selected above.
        </p>
      </div>
    </div>
  );
}
