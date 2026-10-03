import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LogsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/logs" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-base shadow-md shadow-primary/20">
              O
            </div>
            <span className="font-geist text-lg font-bold tracking-tight text-foreground">
              Oryxa
            </span>
            <span className="text-sm text-muted-foreground">/ logs</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
