import { headers } from 'next/headers';
import { SITEMAP_ROUTES, siteUrl } from '@/lib/seo';

/**
 * Host-aware sitemap: each brand lists its own absolute URLs. The proxy skips
 * this path, so the Host header is read directly.
 */
export async function GET(): Promise<Response> {
  const host = (await headers()).get('host');
  const base = siteUrl(host);
  const today = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_ROUTES.map(
    (route) =>
      `  <url><loc>${base}${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${
        route === '/' ? '1.0' : '0.8'
      }</priority></url>`,
  ).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
