import { getBusinessForRequest, getMeForRequest } from '@/lib/server-data';
import { Sidebar } from '@/components/sidebar';

export async function BusinessSidebar({ businessId }: { businessId: string }) {
  const [business, me] = await Promise.all([
    getBusinessForRequest(businessId),
    getMeForRequest(),
  ]);
  return <Sidebar businessId={businessId} businessName={business.name} userName={me.name} />;
}
