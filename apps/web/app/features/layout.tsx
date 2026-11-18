import type { Metadata } from "next";
import { getBrand } from "@/lib/brand-server";
import { socialMetadata } from "@/lib/seo";

/** Full content page: indexable, canonical to itself. */
export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Features — ${companyName}`;
  const description = `See how ${companyName} answers messages and comments, checks your catalog, captures orders and hands off to a human — on Messenger, Instagram and WhatsApp.`;
  return {
    title,
    description,
    alternates: { canonical: "/features" },
    robots: { index: true, follow: true },
    ...socialMetadata({
      title,
      description,
      path: "/features",
      siteName: companyName,
    }),
  };
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
