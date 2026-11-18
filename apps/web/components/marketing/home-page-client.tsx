"use client";

import { useBrand } from "@/components/brand-provider";
import type { PublicPlan } from "@/lib/api";
import { toCompareRows, toDisplayPlans } from "@/lib/plan-display";
import { LandingDashboard } from "../landing/dashboard";
import { LandingFaq } from "../landing/faq";
import { LandingHeader } from "../landing/header";
import {
  LandingHero,
  LandingProofStrip,
  LandingTrustStrip,
} from "../landing/hero";
import "../landing/landing.css";
import { LandingFooter } from "../landing/footer";
import { LandingMidCta } from "../landing/mid-cta";
import { LandingCta, LandingPricing } from "../landing/pricing";
import { ChatWidget } from "../landing/chat-widget";
import { LandingRoot } from "../landing/theme";
import { NvidiaInceptionBand } from "../landing/inception-badge";
import { LandingVideo } from "../landing/video";
import { LandingWorkflow } from "../landing/workflow";

/**
 * Landing page shell: live plan catalogue from the server, mockup-faithful
 * landing UI. Copy that names the product follows the request brand; the demo
 * content (StyleHub BD chat, sample orders) is static mockup content.
 */
export default function HomePageClient({
  plans,
  unavailable = false,
  initialLang = "en",
}: {
  plans: PublicPlan[];
  unavailable?: boolean;
  initialLang?: "en" | "bn";
}) {
  const { companyName } = useBrand();
  const displayPlans = toDisplayPlans(plans);
  const compareRows = toCompareRows(plans);

  return (
    <LandingRoot initialLang={initialLang}>
      <LandingHeader companyName={companyName} />
      <main>
        <LandingHero companyName={companyName} />
        <NvidiaInceptionBand />
        <LandingDashboard companyName={companyName} />
        <LandingTrustStrip />
        <LandingProofStrip />
        <LandingVideo companyName={companyName} />
        <LandingMidCta />
        <LandingWorkflow />
        <LandingPricing
          plans={displayPlans}
          compareRows={compareRows}
          unavailable={unavailable}
        />
        <LandingCta />
        <LandingFaq />
      </main>
      <LandingFooter companyName={companyName} />
      <ChatWidget />
    </LandingRoot>
  );
}
