import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import {
  cachedBusiness,
  cachedMe,
  cachedChannels,
  cachedNotifications,
  cachedBilling,
} from '@/app/_cache/queries';
import { Sidebar, DashboardTopHeader } from '@/components/sidebar';
import { SidebarSkeleton } from '@/components/sidebar-skeleton';

export async function BusinessSidebar({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [business, me, channels, notificationsRes, billingRes] = await Promise.all([
    cachedBusiness(token, businessId).catch(() => ({ id: businessId, name: 'My Store' })),
    cachedMe(token),
    cachedChannels(token, businessId).catch(() => []),
    cachedNotifications(token, businessId).catch(() => ({ notifications: [], unreadCount: 0 })),
    cachedBilling(token, businessId).catch(() => null),
  ]);

  return (
    <Suspense fallback={<SidebarSkeleton />}>
      <Sidebar
        businessId={businessId}
        businessName={business.name}
        userName={me.name}
        channels={channels}
        unreadNotificationsCount={notificationsRes.unreadCount}
        billing={billingRes}
      />
    </Suspense>
  );
}

export async function BusinessTopBar({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [business, me, notificationsRes] = await Promise.all([
    cachedBusiness(token, businessId).catch(() => ({ id: businessId, name: 'My Store' })),
    cachedMe(token),
    cachedNotifications(token, businessId).catch(() => ({ notifications: [], unreadCount: 0 })),
  ]);

  return (
    <DashboardTopHeader
      businessId={businessId}
      businessName={business.name}
      userName={me.name}
      unreadNotificationsCount={notificationsRes.unreadCount}
    />
  );
}
