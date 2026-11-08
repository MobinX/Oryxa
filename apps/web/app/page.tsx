import { cachedPublicPlans } from '@/app/_cache/queries';
import HomePageClient from '@/components/marketing/home-page-client';
import { VideoObjectJsonLd } from '@/components/seo/json-ld';

/**
 * The landing page is server-rendered so the price cards come from the operator's live plan
 * catalogue, not from a marketing constant. The interactive shell stays a client component.
 */
/** Brand shell is request-derived, so this route may block. */
export const instant = false;

export default async function HomePage() {
  const { plans, unavailable } = await cachedPublicPlans();
  // The toggle persists oo-lang as a cookie; reading it here means the first
  // paint already matches instead of flashing English and swapping post-mount.
  const { cookies } = await import('next/headers');
  const initialLang = (await cookies()).get('oo-lang')?.value === 'bn' ? 'bn' : 'en';
  return (
    <>
      <VideoObjectJsonLd />
      <HomePageClient plans={plans} unavailable={Boolean(unavailable)} initialLang={initialLang} />
    </>
  );
}
