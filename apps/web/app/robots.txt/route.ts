import { headers } from 'next/headers';
import { siteUrl } from '@/lib/seo';

/**
 * Host-aware robots.txt: the sitemap URL must be absolute, so it follows the
 * request host. The proxy skips this path, so the Host header is read directly.
 */
export async function GET(): Promise<Response> {
  const host = (await headers()).get('host');
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /b',
    'Disallow: /businesses',
    'Disallow: /api',
    'Disallow: /api2',
    'Disallow: /login',
    '',
    `Sitemap: ${siteUrl(host)}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
