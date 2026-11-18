"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Inbox,
  MessageCircle,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBrand } from "@/components/brand-provider";
import { PublicFooterLinks } from "@/components/legal/public-footer-links";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "AI auto-replies on every channel",
    body: "Customer messages and comments on Messenger, Instagram and WhatsApp get an instant, accurate answer — day and night, in English or Bengali.",
    href: "/docs/ai-auto-replies",
  },
  {
    icon: ShoppingBag,
    title: "Live catalog checks",
    body: 'The AI answers from your real catalog: prices, sizes, stock and variants. No made-up answers, no "sir please wait" delays.',
    href: "/docs/catalog-products",
  },
  {
    icon: ShoppingCart,
    title: "Order capture in chat",
    body: "Customers place orders without leaving the conversation — name, address, items and cash-on-delivery details collected automatically.",
    href: "/docs/inbox-orders",
  },
  {
    icon: UserCheck,
    title: "Human handoff",
    body: "Tricky questions route to your team with full context. The AI handles the routine 80%; your people handle the moments that matter.",
    href: "/docs/inbox-orders",
  },
  {
    icon: Inbox,
    title: "One shared inbox",
    body: "Facebook, Instagram and WhatsApp conversations side by side in a single inbox, so nothing slips through during a sale rush.",
    href: "/docs/getting-started",
  },
  {
    icon: Store,
    title: "Instant storefront",
    body: "Every business gets a shareable store link with its catalog, so a comment or DM can turn into a checkout in one tap.",
    href: "/docs/storefront",
  },
];

export default function FeaturesPage() {
  const { companyName: COMPANY_NAME } = useBrand();
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
              <defs>
                <linearGradient
                  id="logo-grad-feat"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <path
                d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                fill="url(#logo-grad-feat)"
              />
            </svg>
            <span className="font-geist font-black text-xl tracking-tight text-foreground group-hover:opacity-90 transition-opacity">
              {COMPANY_NAME}
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-geist font-black text-3xl sm:text-4xl tracking-tight">
            Everything you need to sell in chat
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            {COMPANY_NAME} turns Messenger, Instagram and WhatsApp into your
            hardest-working salesperson — answering customers, checking your
            catalog and capturing orders automatically.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group bg-card border border-border/50 rounded-card p-6 shadow-card hover:shadow transition-shadow"
            >
              <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                <f.icon className="h-5 w-5 stroke-[1.75]" />
              </div>
              <h2 className="mt-4 font-geist font-bold text-lg tracking-tight group-hover:text-primary transition-colors">
                {f.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {f.body}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center bg-card border border-border/50 rounded-card p-8 sm:p-10 max-w-2xl mx-auto">
          <h2 className="font-geist font-black text-2xl tracking-tight">
            See it on your own page
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Connect a Facebook, Instagram or WhatsApp channel, import your
            catalog, and the AI starts answering customer chats. Most stores are
            live in about ten minutes.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-11 px-6 rounded-element bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95"
            >
              Start Free
            </Link>
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5] rotate-180" /> How
              it works
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground bg-background/50">
        © 2026 {COMPANY_NAME}. All rights reserved.
        <PublicFooterLinks />
      </footer>
    </div>
  );
}
