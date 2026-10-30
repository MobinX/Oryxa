import type { Metadata, Viewport } from 'next';
import { BrandProvider } from '@/components/brand-provider';
import { getBrand } from '@/lib/brand-server';
import './globals.css';

/**
 * The brand comes from request headers, so the shell cannot paint before that read. Opting the
 * root segment out of instant-navigation blocking is the price of host-based branding.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `${companyName} — AI Commerce`,
    description: 'Multi-channel AI auto-reply for e-commerce',
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
      </body>
    </html>
  );
}
