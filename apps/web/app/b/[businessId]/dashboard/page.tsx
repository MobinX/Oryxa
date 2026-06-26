import Link from 'next/link';
import { getBusinessForRequest, getBusinessStatsForRequest } from '@/lib/server-data';
import { Card } from '@/components/ui/card';
import { Package, MessageSquare, ShoppingCart, Radio } from 'lucide-react';

const sections = [
  { href: 'products', label: 'Products', description: 'Manage your catalog and variants', icon: Package, countKey: 'products' as const },
  { href: 'orders', label: 'Orders', description: 'Track and fulfill customer orders', icon: ShoppingCart, countKey: 'orders' as const },
  { href: 'channels', label: 'Channels', description: 'Connect Facebook Messenger', icon: Radio, countKey: 'channels' as const },
  { href: 'inbox', label: 'Inbox', description: 'View AI and human conversations', icon: MessageSquare, countKey: 'conversations' as const },
];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const [business, stats] = await Promise.all([
    getBusinessForRequest(businessId),
    getBusinessStatsForRequest(businessId),
  ]);

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
      <p className="text-sm text-[var(--muted-foreground)] sm:text-base">Welcome to {business.name}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {sections.map(({ href, label, description, icon: Icon, countKey }) => (
          <Link key={href} href={`/b/${businessId}/${href}`}>
            <Card className="group h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold group-hover:text-[var(--primary)]">{label}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-[var(--muted-foreground)] sm:text-2xl">
                  {stats[countKey]}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
