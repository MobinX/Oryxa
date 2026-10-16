/**
 * The one word the UI prints for the product, so re-branding is one env value rather than a
 * find-and-replace across every page.
 *
 * `COMPANY_NAME` carries no `NEXT_PUBLIC_` prefix on purpose: `env` in next.config.ts inlines it
 * into the server and the browser bundle alike, so a client component such as the sidebar reads
 * the same value a layout's metadata does, and the name is not stored twice under two keys.
 *
 * The fallback is not decoration. A deployment that forgets the variable would otherwise render
 * an empty brand in the navbar, the login title and every legal footer — pages that say who they
 * belong to, which is exactly where a blank is worst.
 */
export const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || 'Oryxa';
