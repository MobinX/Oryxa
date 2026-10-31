import type { Metadata, Viewport } from 'next';
import { BrandProvider } from '@/components/brand-provider';
import { CookieConsentProvider } from '@/components/cookie-consent';
import { OrganizationJsonLd } from '@/components/seo/json-ld';
import { getBrand } from '@/lib/brand-server';
import { siteUrl } from '@/lib/seo';
import './globals.css';

/**
 * The brand comes from request headers, so the shell cannot paint before that read. Opting the
 * root segment out of instant-navigation blocking is the price of host-based branding.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const { companyName } = brand;
  const title = `${companyName} — AI Auto-Reply for Messenger & Instagram`;
  const description = `${companyName} answers DMs, comments and storefront questions with AI, manages catalog and orders — for Facebook, Instagram and WhatsApp commerce.`;
  return {
    metadataBase: new URL(siteUrl(brand.host)),
    title,
    description,
    applicationName: companyName,
    manifest: '/manifest.webmanifest',
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: companyName,
      title,
      description,
      url: '/',
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: `${companyName} preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-default.png'],
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
        { url: '/icon-48.png', sizes: '48x48', type: 'image/png' },
        { url: '/icon-96.png', sizes: '96x96', type: 'image/png' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      shortcut: '/favicon.ico',
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5B3DF5',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
        <OrganizationJsonLd />
      </head>
      <body>
        <BrandProvider brand={brand}>
          <CookieConsentProvider>{children}</CookieConsentProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
