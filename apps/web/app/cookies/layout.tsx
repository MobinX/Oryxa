import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Cookie Policy — ${companyName}`;
  const description = `Cookies and local storage used by ${companyName}, the choices you have, and how to change or withdraw consent.`;
  return {
    title,
    description,
    alternates: { canonical: '/cookies' },
    ...socialMetadata({ title, description, path: '/cookies', siteName: companyName }),
  };
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
