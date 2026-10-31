import { getBrand } from '@/lib/brand-server';

/** Install-prompt metadata, branded per request host. */
export async function GET(): Promise<Response> {
  const { companyName } = await getBrand();
  return Response.json(
    {
      name: companyName,
      short_name: companyName,
      description: `${companyName} AI replies, catalog and orders for social commerce.`,
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0B0D1B',
      theme_color: '#5B3DF5',
      icons: [
        { src: '/icon-48.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
        { src: '/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
