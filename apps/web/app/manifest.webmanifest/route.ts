import { getBrand } from '@/lib/brand-server';

/** Install-prompt metadata, branded per request host. */
export async function GET(): Promise<Response> {
  const { companyName } = await getBrand();
  return Response.json({
    name: companyName,
    short_name: companyName,
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0D1B',
    theme_color: '#5B3DF5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}
