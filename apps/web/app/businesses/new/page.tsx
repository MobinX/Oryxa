import Link from 'next/link';
import { createBusinessAction } from '@/app/actions/business';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

export default function NewBusinessPage() {
  return (
    <div>
      <Link
        href="/businesses"
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to businesses
      </Link>
      <Card className="mt-6 max-w-lg">
        <h1 className="text-2xl font-bold">Create a business</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Set up a workspace for your store.
        </p>
        <form action={createBusinessAction} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input className="mt-1" name="name" placeholder="Acme Store" required />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              className="mt-1"
              name="description"
              placeholder="What do you sell?"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Link
              href="/businesses"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-sm font-medium hover:bg-[var(--muted)]"
            >
              Cancel
            </Link>
            <Button type="submit" className="flex-1">
              Create business
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
