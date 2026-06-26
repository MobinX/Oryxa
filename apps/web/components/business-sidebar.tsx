import { getBusinessForRequest } from '@/lib/server-data';
import { Sidebar } from '@/components/sidebar';

export async function BusinessSidebar({ businessId }: { businessId: string }) {
  const business = await getBusinessForRequest(businessId);
  return <Sidebar businessId={businessId} businessName={business.name} />;
}
