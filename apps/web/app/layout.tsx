import type { Metadata, Viewport } from "next";
import { BrandProvider } from "@/components/brand-provider";
import { CookieConsentProvider } from "@/components/cookie-consent";
import { OrganizationJsonLd } from "@/components/seo/json-ld";
import { getBrand } from "@/lib/brand-server";
import { siteUrl } from "@/lib/seo";
import "./globals.css";

/**
 * The brand comes from request headers, so the shell cannot paint before that read. Opting the
 * root segment out of instant-navigation blocking is the price of host-based branding.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const { companyName } = brand;
  // Tab title is the company name only so the site is easy to find.
  const title = companyName;
  const description = `${companyName} answers DMs, comments and storefront questions with AI — catalog, orders and handoff for Facebook, Instagram and WhatsApp. Start free.`;
  return {
    metadataBase: new URL(siteUrl(brand.host)),
    title,
    description,
    applicationName: companyName,
    authors: [{ name: companyName }],
    creator: companyName,
    publisher: companyName,
    category: "ecommerce",
    keywords: [
      companyName,
      "AI auto-reply",
      "Messenger bot",
      "Instagram DM automation",
      "WhatsApp commerce",
      "social commerce Bangladesh",
    ],
    robots: { index: true, follow: true },
    manifest: "/manifest.webmanifest",
    alternates: { canonical: "/" },
    // Search-console proofs. Empty env = tag omitted. Codes come from Bing
    // Webmaster Tools (msvalidate.01) and Yandex Webmaster after adding the
    // site there; IndexNow needs no per-engine code (see lib/indexnow.ts).
    verification: {
      ...(process.env.YANDEX_SITE_VERIFICATION
        ? { yandex: process.env.YANDEX_SITE_VERIFICATION }
        : {}),
      ...(process.env.BING_SITE_VERIFICATION
        ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
        : {}),
    },
    openGraph: {
      type: "website",
      siteName: companyName,
      title,
      description,
      url: "/",
      images: [
        {
          url: "/og-default.png",
          width: 1200,
          height: 630,
          alt: `${companyName} preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-default.png"],
    },
    icons: {
      icon: [
        // Transparent cart mark first so the tab icon never shows a black box.
        { url: "/onlyorders-mark.png", type: "image/png" },
        { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
        { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
        { url: "/icon-96.png", sizes: "96x96", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: [
        { url: "/onlyorders-mark.png", type: "image/png" },
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5B3DF5",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        {/* Landing fonts (see theme.tsx note): plain stylesheet, not next/font. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <BrandProvider brand={brand}>
          <CookieConsentProvider>{children}</CookieConsentProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
