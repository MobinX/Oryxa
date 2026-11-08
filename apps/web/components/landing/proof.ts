export type ProofStat = {
  /** The number as displayed, e.g. '12,400+'. Kept a string so formatting is exact. */
  value: string;
  en: string;
  bn: string;
};

/**
 * Proof-strip numbers. Figures below are owner-provided (November 2026):
 * ten onboarded businesses and counting. Update the values — never the
 * honesty — as traction grows.
 */
export const PROOF_STATS: ProofStat[] = [
  {
    value: "10",
    en: "Businesses onboard and selling",
    bn: "১০টি ব্যবসা বিক্রি করছে",
  },
  {
    value: "3",
    en: "Channels in one inbox — Messenger, Instagram, WhatsApp",
    bn: "এক ইনবক্সে ৩টি চ্যানেল",
  },
  {
    value: "24/7",
    en: "Instant AI replies, even after hours",
    bn: "২৪/৭ তাৎক্ষণিক এআই উত্তর",
  },
];
