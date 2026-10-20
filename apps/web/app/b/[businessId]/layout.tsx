import { Suspense } from 'react';
import { BusinessSidebar } from '@/components/business-sidebar';
import { SidebarSkeleton } from '@/components/sidebar-skeleton';
import { PushMessageListener } from '@/components/push-message-listener';

export default function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <PushMessageListener />
      <Suspense fallback={<SidebarSkeleton />}>
        <BusinessSidebar params={params} />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
