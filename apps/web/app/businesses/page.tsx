'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { listBusinesses } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CreateBusinessForm } from '@/components/create-business-form';

export default function BusinessesPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => listBusinesses(token!),
    enabled: !!token,
  });

  const businesses = data?.businesses ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your businesses</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            {user?.displayName
              ? `Welcome back, ${user.displayName}.`
              : 'Select a business or create a new one.'}
          </p>
        </div>
        {!showCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New business
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className="mt-8">
          <h2 className="text-lg font-semibold">Create a business</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Set up a workspace for your store.
          </p>
          <div className="mt-4">
            <CreateBusinessForm
              token={token!}
              onCancel={() => setShowCreate(false)}
              onCreated={(id) => {
                queryClient.invalidateQueries({ queryKey: ['businesses'] });
                setShowCreate(false);
                router.push(`/b/${id}/dashboard`);
              }}
            />
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="mt-12 text-center text-[var(--muted-foreground)]">Loading businesses...</p>
      ) : businesses.length === 0 && !showCreate ? (
        <Card className="mt-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold">No businesses yet</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Create your first business to manage products, orders, and channels.
          </p>
          <Button className="mt-6" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first business
          </Button>
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
