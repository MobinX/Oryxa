import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Terms — ${companyName}`;
  const description = `Terms and conditions for using ${companyName}: accounts, acceptable use, AI replies, orders, liability and contact.`;
  return {
    title,
    description,
    alternates: { canonical: '/terms' },
    ...socialMetadata({ title, description, path: '/terms', siteName: companyName }),
  };
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
