import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { SignOutForm } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

export default function BusinessesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/businesses" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-base shadow-md shadow-primary/20">
              O
            </div>
            <span className="font-geist text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-foreground">
              Oryxa
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutForm className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </SignOutForm>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
