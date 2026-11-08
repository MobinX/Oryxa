import type { Metadata } from "next";
import { getBrand } from "@/lib/brand-server";
import { socialMetadata } from "@/lib/seo";

/** Solutions hub with real content — indexable. */
export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Solutions — ${companyName}`;
  const description = `How ${companyName} fits social-first stores: one inbox, AI replies, catalog checks and orders in one place.`;
  return {
    title,
    description,
    alternates: { canonical: "/solutions" },
    robots: { index: true, follow: true },
    ...socialMetadata({
      title,
      description,
      path: "/solutions",
      siteName: companyName,
    }),
  };
}

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
