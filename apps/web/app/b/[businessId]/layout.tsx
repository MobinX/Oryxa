import { requireAuth } from '@/lib/auth';
import { getBusiness } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const business = await getBusiness(token, businessId);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar businessId={businessId} businessName={business.name} />
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
