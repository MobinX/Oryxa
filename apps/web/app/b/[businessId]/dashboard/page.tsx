'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package, MessageSquare, ShoppingCart, Radio } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { getBusiness, listProducts, listOrders, listChannels, listConversations } from '@/lib/api';
import { Card } from '@/components/ui/card';

const sections = [
  {
    href: 'products',
    label: 'Products',
    description: 'Manage your catalog and variants',
    icon: Package,
    countKey: 'products' as const,
  },
  {
    href: 'orders',
    label: 'Orders',
    description: 'Track and fulfill customer orders',
    icon: ShoppingCart,
    countKey: 'orders' as const,
  },
  {
    href: 'channels',
    label: 'Channels',
    description: 'Connect Facebook Messenger',
    icon: Radio,
    countKey: 'channels' as const,
  },
  {
    href: 'inbox',
    label: 'Inbox',
    description: 'View AI and human conversations',
    icon: MessageSquare,
    countKey: 'conversations' as const,
  },
];

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

  const { data: productsData } = useQuery({
    queryKey: ['products', businessId, 'count'],
    queryFn: () => listProducts(token!, businessId, { limit: 1 }),
    enabled: !!token,
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', businessId, 'count'],
    queryFn: () => listOrders(token!, businessId),
    enabled: !!token,
  });

  const { data: channels } = useQuery({
    queryKey: ['channels', businessId, 'count'],
    queryFn: () => listChannels(token!, businessId),
    enabled: !!token,
  });

  const { data: conversations } = useQuery({
    queryKey: ['conversations', businessId, 'count'],
    queryFn: () => listConversations(token!, businessId),
    enabled: !!token,
  });

  const counts = {
    products: productsData?.totalCount ?? 0,
    orders: orders?.length ?? 0,
    channels: channels?.length ?? 0,
    conversations: conversations?.length ?? 0,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-[var(--muted-foreground)]">
        {business?.name ? `Welcome to ${business.name}` : 'Welcome back'}
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {sections.map(({ href, label, description, icon: Icon, countKey }) => (
          <Link key={href} href={`/b/${businessId}/${href}`}>
            <Card className="group h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-[var(--primary)]">{label}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-[var(--muted-foreground)]">
                  {counts[countKey]}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
