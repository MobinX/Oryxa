import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Terms — ${companyName}`,
    description: `Terms and conditions for using ${companyName}: accounts, acceptable use, AI replies, orders, liability and contact.`,
    alternates: { canonical: '/terms' },
  };
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
