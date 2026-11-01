/**
 * Brand identity is decided by the request host, not by the build. The middleware stamps the two
 * names onto request headers, server components read them through `getBrand()`, and client
 * components receive the same object from the root `BrandProvider`.
 */
export type BrandInfo = {
  companyName: string;
  parentCompanyName: string;
  otherCompanyName: string;
  host: string;
};

export const BRAND_HEADERS = {
  company: 'x-brand-company',
  parent: 'x-brand-parent',
  host: 'x-brand-host',
} as const;

export const BRAND_DEFAULT_HOST = 'oryxa.rrcomputer.com.bd';

const ORYXA_HOSTS = new Set(['oryxa.rrcomputer.com.bd', 'www.oryxa.rrcomputer.com.bd']);
const ONLY_ORDERS_HOSTS = new Set([
  'onlyorders.tech',
  'www.onlyorders.tech',
  'mail.onlyorders.tech',
  'admin.onlyorders.tech',
  'sudo.onlyorders.tech',
]);

export const DEFAULT_BRAND: BrandInfo = {
  companyName: 'Oryxa',
  parentCompanyName: 'RR Computer',
  otherCompanyName: 'OnlyOrders',
  host: BRAND_DEFAULT_HOST,
};

/** A port is transport, not identity; casing and trailing dots are never meaningful in a host. */
export function normalizeBrandHost(host: string | null | undefined): string {
  return (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

/** The one place the host-to-brand table lives. Unknown hosts (preview, localhost) get Oryxa. */
export function brandForHost(host: string | null | undefined): BrandInfo {
  const hostname = normalizeBrandHost(host);
  if (ONLY_ORDERS_HOSTS.has(hostname)) {
    return {
      companyName: 'OnlyOrders',
      parentCompanyName: 'OnlyOrders',
      otherCompanyName: 'Oryxa',
      host: hostname,
    };
  }
  if (ORYXA_HOSTS.has(hostname)) {
    return { ...DEFAULT_BRAND, host: hostname };
  }
  return { ...DEFAULT_BRAND, host: hostname || BRAND_DEFAULT_HOST };
}

/** Reads the middleware's headers, falling back to the Host header when they are absent. */
export function brandFromHeaders(headers: Pick<Headers, 'get'>): BrandInfo {
  const company = headers.get(BRAND_HEADERS.company)?.trim();
  const parent = headers.get(BRAND_HEADERS.parent)?.trim();
  const host = headers.get(BRAND_HEADERS.host)?.trim();

  if (company && parent) {
    return {
      companyName: company,
      parentCompanyName: parent,
      otherCompanyName: company === 'OnlyOrders' ? 'Oryxa' : 'OnlyOrders',
      host: normalizeBrandHost(host) || normalizeBrandHost(headers.get('host')) || BRAND_DEFAULT_HOST,
    };
  }

  return brandForHost(headers.get('host'));
}

const ONLYORDERS_SUPPORT_EMAIL = 'support@onlyorders.tech';
const DEFAULT_SUPPORT_EMAIL = 'alamsarwar@hotmail.com';

/**
 * Contact mailbox follows the brand: the support address exists only for the
 * OnlyOrders host; every other host keeps the established contact address.
 */
export function supportEmailForHost(host: string | null | undefined): string {
  return brandForHost(host).companyName === 'OnlyOrders'
    ? ONLYORDERS_SUPPORT_EMAIL
    : DEFAULT_SUPPORT_EMAIL;
}
