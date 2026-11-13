import type { Metadata } from 'next';

import { MobileGoogleLogin } from '@/components/mobile-google-login';

export const metadata: Metadata = {
  title: 'Continue with Google',
  robots: { index: false, follow: false },
};

export default function MobileGoogleLoginPage() {
  return <MobileGoogleLogin />;
}