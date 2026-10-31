import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

/** Placeholder page: noindex until real content ships, but follow links home. */
export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Documentation — ${companyName}`;
  const description = `Guides and reference material for ${companyName} merchants, channels and AI agents.`;
  return {
    title,
    description,
    alternates: { canonical: '/docs' },
    robots: { index: false, follow: true },
    ...socialMetadata({ title, description, path: '/docs', siteName: companyName }),
  };
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
