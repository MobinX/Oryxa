import type { Metadata } from 'next';

/** Placeholder page: noindex until real content ships, but follow links home. */
export const metadata: Metadata = {
  title: 'Features',
  robots: { index: false, follow: true },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
