import type { Metadata } from "next";
import { getBrand } from "@/lib/brand-server";
import { socialMetadata } from "@/lib/seo";

/** Docs hub with real guides — indexable. Article pages set their own canonical. */

/** Brand comes from request headers, so this segment opts out of instant prerendering. */
export const instant = false;
export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Documentation — ${companyName}`;
  const description = `Guides for ${companyName} merchants: connect WhatsApp, Instagram and Facebook, load your catalog, switch on AI replies, and fulfil orders.`;
  return {
    title,
    description,
    alternates: { canonical: "/docs" },
    robots: { index: true, follow: true },
    ...socialMetadata({
      title,
      description,
      path: "/docs",
      siteName: companyName,
    }),
  };
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
