'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { logout } from '@/lib/firebase';

export default function BusinessesLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) router.push('/login');
  }, [token, loading, router]);

  if (loading || !token) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/businesses" className="text-xl font-bold text-[var(--primary)]">
            Oryxa
          </Link>
          <button
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
