import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Privacy — ${companyName}`,
    description: `Privacy policy for ${companyName}: what data is collected, how it is used and shared, retention, rights and contact.`,
    alternates: { canonical: '/privacy' },
  };
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
