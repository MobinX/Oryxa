'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 shadow-sm',
        className
      )}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5 stroke-[1.75]" />
      ) : (
        <Sun className="h-5 w-5 stroke-[1.75]" />
      )}
    </button>
  );
}
