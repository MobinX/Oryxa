/**
 * Brand configuration for OnlyOrdes (OnlyOrders) / Oryxa.
 *
 * `COMPANY_NAME` defaults to 'Oryxa' to match the current brand identity across all marketing
 * and merchant dashboard screens, while supporting seamless runtime swapping via `COMPANY_NAME`.
 */
export const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || 'Oryxa';
export const PARENT_COMPANY_NAME = process.env.PARENT_COMPANY_NAME?.trim() || 'RR Computer';

/** If COMPANY_NAME is Oryxa → OTHER is OnlyOrdes; if it's OnlyOrdes → OTHER is Oryxa. */
export const OTHER_COMPANY_NAME =
  COMPANY_NAME === 'Oryxa' ? 'OnlyOrdes' : 'Oryxa';
