import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

/** Placeholder page: noindex until real content ships, but follow links home. */
export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Features — ${companyName}`;
  const description = `See how ${companyName} answers messages and comments, captures orders and keeps a human in control.`;
  return {
    title,
    description,
    alternates: { canonical: '/features' },
    robots: { index: false, follow: true },
    ...socialMetadata({ title, description, path: '/features', siteName: companyName }),
  };
}

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
