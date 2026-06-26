import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { SignOutForm } from '@/components/sign-out-button';

export default function BusinessesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/businesses" className="text-lg font-bold text-[var(--primary)] sm:text-xl">
            Oryxa
          </Link>
          <SignOutForm className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </SignOutForm>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
