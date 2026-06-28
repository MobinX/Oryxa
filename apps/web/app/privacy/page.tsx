'use client';

import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col justify-between">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
              <defs>
                <linearGradient id="logo-grad-priv" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <path
                d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                fill="url(#logo-grad-priv)"
              />
            </svg>
            <span className="font-geist font-black text-xl tracking-tight text-foreground group-hover:opacity-90 transition-opacity">
              Oryxa
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link 
              href="/login" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm px-4.5 py-2.5 rounded-element transition-all active:scale-95 shadow-sm"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative min-h-[calc(100vh-8rem)] flex-1 flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none -z-10" />
        
        <div className="max-w-md bg-card border border-border/50 rounded-card shadow-card p-8 sm:p-10 relative z-10 flex flex-col items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center animate-pulse">
            <ShieldCheck className="h-7 w-7 stroke-[1.75]" />
          </div>
          
          <div className="space-y-2">
            <h1 className="font-geist font-black text-3xl tracking-tight text-foreground">
              Privacy Policy
            </h1>
            <p className="font-inter text-sm text-muted-foreground leading-relaxed">
              We value your data privacy. Our complete compliance policy, detailing data protection standards under GDPR, is currently being finalized.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm hover:shadow active:scale-95 mt-2"
          >
            <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5]" /> Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground bg-background/50">
        © 2026 Oryxa. All rights reserved.
      </footer>
    </div>
  );
}
