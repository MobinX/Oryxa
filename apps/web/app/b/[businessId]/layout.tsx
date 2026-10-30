import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BusinessSidebar, BusinessTopBar } from '@/components/business-sidebar';

/** Merchant console: never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
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
    <div className="flex min-h-screen flex-col bg-[#F8F9FC] dark:bg-[#0B0D1B] lg:flex-row">
      <PushMessageListener />
      <Suspense fallback={<SidebarSkeleton />}>
        <BusinessSidebar params={params} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="hidden h-16 border-b border-slate-200/80 bg-white lg:block" />}>
          <BusinessTopBar params={params} />
        </Suspense>
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
