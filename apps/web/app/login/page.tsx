'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.push('/onboarding');
    }
  }, [user, loading, router]);

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/unauthorized-domain') {
        setError(
          `This domain (${window.location.hostname}) is not authorized in Firebase. ` +
            'Open Firebase Console → Authentication → Settings → Authorized domains and add it.',
        );
      } else {
        setError(err.message ?? 'Sign-in failed. Please try again.');
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-[var(--primary)]">Oryxa</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          AI-powered customer support for your e-commerce store
        </p>
        <Button className="mt-8 w-full" size="lg" onClick={handleSignIn}>
          Continue with Google
        </Button>
        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
