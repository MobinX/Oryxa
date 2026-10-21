/**
 * Brand configuration for OnlyOrdes (OnlyOrders) / Oryxa.
 *
 * `COMPANY_NAME` defaults to 'OnlyOrdes' to match the UI design system across all marketing
 * and merchant dashboard screens, while supporting seamless runtime swapping via `COMPANY_NAME`.
 */
export const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || 'OnlyOrdes';
export const PARENT_COMPANY_NAME = process.env.PARENT_COMPANY_NAME?.trim() || 'OnlyOrders';

export const OTHER_COMPANY_NAME =
  COMPANY_NAME === 'OnlyOrders' || COMPANY_NAME === 'OnlyOrdes' ? 'Oryxa' : 'OnlyOrders';
