import type { Metadata, Viewport } from 'next';
import { BrandProvider } from '@/components/brand-provider';
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
  const description = `${companyName} answers customer comments and messages with AI, manages catalog and orders, and runs your storefront — for Facebook, Instagram and WhatsApp commerce.`;
  return {
    metadataBase: new URL(siteUrl(brand.host)),
    title,
    description,
    manifest: '/manifest.webmanifest',
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: companyName,
      title,
      description,
      images: ['/og-default.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-default.png'],
    },
    icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
      </head>
      <body>
        <BrandProvider brand={brand}>{children}</BrandProvider>
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
