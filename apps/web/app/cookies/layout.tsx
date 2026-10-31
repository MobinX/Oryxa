import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Cookie Policy — ${companyName}`,
    description: `Cookies and local storage used by ${companyName}, the choices you have, and how to change or withdraw consent.`,
    alternates: { canonical: '/cookies' },
  };
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
