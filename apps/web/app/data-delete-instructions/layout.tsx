import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Data Deletion — ${companyName}`,
    description: `How to request deletion of your ${companyName} data: what is removed, how long it takes, and how to contact us.`,
    alternates: { canonical: '/data-delete-instructions' },
  };
}

export default function DataDeleteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
