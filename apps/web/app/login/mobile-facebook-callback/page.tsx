import type { Metadata } from 'next';

import { MobileFacebookCallback } from '@/components/mobile-facebook-callback';

export const metadata: Metadata = {
  title: 'Connecting Facebook',
  robots: { index: false, follow: false },
};

export default function MobileFacebookCallbackPage() {
  return <MobileFacebookCallback />;
}