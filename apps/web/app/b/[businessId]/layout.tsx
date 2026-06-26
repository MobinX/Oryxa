import { Suspense } from 'react';
import { BusinessSidebar } from '@/components/business-sidebar';
import { SidebarSkeleton } from '@/components/sidebar-skeleton';

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<SidebarSkeleton businessId={businessId} />}>
        <BusinessSidebar businessId={businessId} />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
