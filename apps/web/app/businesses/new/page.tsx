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
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-6 pt-4 border-t border-border">
            <Link href="/businesses" className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="w-full">
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="w-full sm:w-auto">
              Create business
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
