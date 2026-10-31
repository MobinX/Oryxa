import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Privacy — ${companyName}`;
  const description = `Privacy policy for ${companyName}: what data is collected, how it is used and shared, retention, rights and contact.`;
  return {
    title,
    description,
    alternates: { canonical: '/privacy' },
    ...socialMetadata({ title, description, path: '/privacy', siteName: companyName }),
  };
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
