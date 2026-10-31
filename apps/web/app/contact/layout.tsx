import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Contact — ${companyName}`,
    description: `Contact ${companyName} for support, billing questions, and general information.`,
    alternates: { canonical: '/contact' },
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
