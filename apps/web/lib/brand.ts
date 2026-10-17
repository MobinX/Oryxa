/**
 * The two names the UI prints for itself, so re-branding is two env values rather than a
 * find-and-replace across every page.
 *
 * Neither carries a `NEXT_PUBLIC_` prefix on purpose: `env` in next.config.ts inlines them into
 * the server and the browser bundle alike, so a client component such as the sidebar reads the
 * same value a layout's metadata does, and a name is not stored twice under two keys.
 *
 * `COMPANY_NAME` is the product the customer sees; `PARENT_COMPANY_NAME` is the legal entity
 * behind it, and they part ways in the sentences that name both — the navbar says the product,
 * the Terms footer says the product is a product of the entity.
 *
 * The fallbacks are not decoration. A deployment that forgets a variable would otherwise render
 * an empty brand in the navbar, the login title and every legal footer, and an ownerless Terms
 * page — text whose whole job is to say who you are contracting with, which is where a blank is
 * worst.
 */
export const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || 'Oryxa';
export const PARENT_COMPANY_NAME = process.env.PARENT_COMPANY_NAME?.trim() || 'RR Computer';

/**
 * The name the admin panel offers to switch to, so the button and the swap agree on the two brands
 * without either of them hard-coding the other.
 *
 * Anything that is not one of the two known names reads as the first brand's opposite, because the
 * swap on the API side refuses an unknown `COMPANY_NAME` outright — a button that offered to become
 * what the project already is would be pressed for nothing.
 */
export const OTHER_COMPANY_NAME = COMPANY_NAME === 'OnlyOrders' ? 'Oryxa' : 'OnlyOrders';
