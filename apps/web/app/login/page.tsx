'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/onboarding');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-[var(--primary)]">Oryxa</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          AI-powered customer support for your e-commerce store
        </p>
        <Button
          className="mt-8 w-full"
          size="lg"
          onClick={async () => {
            try {
              await signInWithGoogle();
            } catch (e) {
              console.error(e);
              alert('Login failed. Check Firebase configuration.');
            }
          }}
        >
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
