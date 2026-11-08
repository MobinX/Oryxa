export type ProofStat = {
  /** The number as displayed, e.g. '12,400+'. Kept a string so formatting is exact. */
  value: string;
  en: string;
  bn: string;
};

/**
 * Proof-strip numbers (orders processed, reply time, seller count...).
 *
 * EMPTY ON PURPOSE: the strip renders nothing until the owner fills real
 * figures. Never ship made-up stats here — one fabricated number destroys
 * the trust the whole strip exists to build.
 *
 * Example entry:
 * { value: '12,400+', en: 'Orders confirmed in chat', bn: 'চ্যাটে কনফার্ম অর্ডার' },
 */
export const PROOF_STATS: ProofStat[] = [];
