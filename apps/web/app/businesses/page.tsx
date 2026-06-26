import Link from 'next/link';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listBusinesses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default async function BusinessesPage() {
  const token = await requireAuth();
  const { businesses } = await listBusinesses(token);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Your businesses</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Select a business or create a new one.
          </p>
        </div>
        <Link href="/businesses/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New business
          </Button>
        </Link>
      </div>

      {businesses.length === 0 ? (
        <Card className="mt-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold">No businesses yet</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Create your first business to manage products, orders, and channels.
          </p>
          <Link href="/businesses/new" className="mt-6 inline-block">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create your first business
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {businesses.map((business) => (
            <Link key={business.id} href={`/b/${business.id}/dashboard`}>
              <Card className="group h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold group-hover:text-[var(--primary)]">
                        {business.name}
                      </h2>
                      {business.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                          {business.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                        Created {new Date(business.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
