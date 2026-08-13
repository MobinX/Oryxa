import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness, cachedMe } from '@/app/_cache/queries';
import { Sidebar } from '@/components/sidebar';
import { SidebarSkeleton } from '@/components/sidebar-skeleton';

export async function BusinessSidebar({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [business, me] = await Promise.all([
    cachedBusiness(token, businessId),
    cachedMe(token),
  ]);

  return (
    <Suspense fallback={<SidebarSkeleton />}>
      <Sidebar businessId={businessId} businessName={business.name} userName={me.name} />
    </Suspense>
  );
}
