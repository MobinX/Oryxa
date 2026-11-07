'use client';

import { useBrand } from '@/components/brand-provider';
import type { PublicPlan } from '@/lib/api';
import { toDisplayPlans } from '@/lib/plan-display';
import { LandingDashboard } from '../landing/dashboard';
import { LandingHeader } from '../landing/header';
import { LandingHero, LandingTrustStrip } from '../landing/hero';
import '../landing/landing.css';
import { LandingCta, LandingFooter, LandingPricing } from '../landing/pricing';
import { LandingRoot } from '../landing/theme';
import { LandingVideo } from '../landing/video';
import { LandingWorkflow } from '../landing/workflow';

/**
 * Landing page shell: live plan catalogue from the server, mockup-faithful
 * landing UI. Copy that names the product follows the request brand; the demo
 * content (StyleHub BD chat, sample orders) is static mockup content.
 */
export default function HomePageClient({
  plans,
  unavailable = false,
}: {
  plans: PublicPlan[];
  unavailable?: boolean;
}) {
  const { companyName } = useBrand();
  const displayPlans = toDisplayPlans(plans);

  return (
    <LandingRoot>
      <LandingHeader companyName={companyName} />
      <main>
        <LandingHero companyName={companyName} />
        <LandingDashboard companyName={companyName} />
        <LandingTrustStrip />
        <LandingVideo companyName={companyName} />
        <LandingWorkflow />
        <LandingPricing plans={displayPlans} unavailable={unavailable} />
        <LandingCta />
      </main>
      <LandingFooter companyName={companyName} />
    </LandingRoot>
  );
}
