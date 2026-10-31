import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  const title = `Data Deletion — ${companyName}`;
  const description = `How to request deletion of your ${companyName} data: what is removed, how long it takes, and how to contact us.`;
  return {
    title,
    description,
    alternates: { canonical: '/data-delete-instructions' },
    ...socialMetadata({
      title,
      description,
      path: '/data-delete-instructions',
      siteName: companyName,
    }),
  };
}

export default function DataDeleteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
