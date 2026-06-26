import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getBusiness } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { updateBusinessAction, deleteBusinessAction } from '@/app/actions/business';

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  let business;
  try {
    business = await getBusiness(token, businessId);
  } catch {
    notFound();
  }

  return (
    <div>
      <Link
        href="/businesses"
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to businesses
      </Link>
      <Card className="mt-4 max-w-lg sm:mt-6">
        <h1 className="text-2xl font-bold">Edit business</h1>
        <form action={updateBusinessAction.bind(null, businessId)} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input className="mt-1" name="name" defaultValue={business.name} required />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea className="mt-1" name="description" rows={3} defaultValue={business.description ?? ''} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Input className="mt-1" name="type" defaultValue={business.type ?? ''} placeholder="Retail, F&B…" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input className="mt-1" name="phone" defaultValue={business.phone ?? ''} />
            </div>
            <div>
              <label className="text-sm font-medium">Employees</label>
              <Input
                className="mt-1"
                name="employeeCount"
                type="number"
                min="1"
                defaultValue={business.employeeCount ? String(business.employeeCount) : ''}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-between">
            <form action={deleteBusinessAction.bind(null, businessId)}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete business
              </button>
            </form>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link
                href="/businesses"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium hover:bg-[var(--muted)]"
              >
                Cancel
              </Link>
              <Button type="submit">Save changes</Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
