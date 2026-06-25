'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { getBusiness } from '@/lib/api';
import { Card } from '@/components/ui/card';

export default function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();

  const { data: business } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => getBusiness(token!, businessId),
    enabled: !!token,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-[var(--muted-foreground)]">
        Welcome back{(business as { name?: string })?.name ? `, ${(business as { name: string }).name}` : ''}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="font-semibold">Products</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Manage your catalog</p>
        </Card>
        <Card>
          <h3 className="font-semibold">Channels</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Connect Facebook Messenger</p>
        </Card>
        <Card>
          <h3 className="font-semibold">Inbox</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">View AI & human conversations</p>
        </Card>
      </div>
    </div>
  );
}
