import { cachedPublicPlans } from '@/app/_cache/queries';
import HomePageClient from '@/components/marketing/home-page-client';

/**
 * The landing page is server-rendered so the price cards come from the operator's live plan
 * catalogue, not from a marketing constant. The interactive shell stays a client component.
 */
/** Brand shell is request-derived, so this route may block. */
export const instant = false;

export default async function HomePage() {
  const { plans, unavailable } = await cachedPublicPlans();
  return <HomePageClient plans={plans} unavailable={Boolean(unavailable)} />;
}
