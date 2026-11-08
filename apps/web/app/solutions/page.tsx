"use client";

import Link from "next/link";
import { ArrowRight, Instagram, MessageCircle, Store } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBrand } from "@/components/brand-provider";
import { PublicFooterLinks } from "@/components/legal/public-footer-links";

const SOLUTIONS = [
  {
    icon: Store,
    title: "Facebook Page shops",
    who: "You sell through posts, comments, and Messenger — and questions bury you.",
    bullets: [
      "Every comment question answered from your catalog, in seconds",
      "Messenger chats flow into one inbox with orders attached",
      "Your storefront link turns browsers into COD checkouts",
    ],
    doc: { slug: "connect-facebook-instagram", label: "Connect your Page" },
  },
  {
    icon: Instagram,
    title: "Instagram boutiques",
    who: "DMs are your storefront — but DMs don’t scale by hand.",
    bullets: [
      "Story replies and DMs answered instantly, day and night",
      "Product photos and prices shared automatically from your catalog",
      "Confirmed sales land in Orders with delivery details included",
    ],
    doc: { slug: "connect-facebook-instagram", label: "Connect Instagram" },
  },
  {
    icon: MessageCircle,
    title: "WhatsApp sellers",
    who: "Your customers live on WhatsApp. Meet them there, without living in it.",
    bullets: [
      "Greetings, price checks, and availability handled by the AI agent",
      "Order updates and follow-ups from the same inbox",
      "One number, one catalog, zero missed chats after hours",
    ],
    doc: { slug: "connect-whatsapp", label: "Connect WhatsApp" },
  },
];

export default function SolutionsPage() {
  const { companyName: COMPANY_NAME } = useBrand();
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col justify-between">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/icon-96.png"
              alt=""
              width={32}
              height={32}
              className="w-8 h-8 select-none"
              draggable={false}
            />
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Solutions
          </p>
          <h1 className="mt-3 font-geist font-black text-3xl sm:text-4xl tracking-tight">
            Built for social-first sellers
          </h1>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            {COMPANY_NAME} fits the way Bangladesh already shops — in chat. Pick
            the channel your customers use and see exactly how your days change.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {SOLUTIONS.map((solution) => (
            <article
              key={solution.title}
              className="flex flex-col rounded-card border border-border/60 bg-card p-6 sm:p-7 shadow-card"
            >
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                <solution.icon className="h-6 w-6 stroke-[1.75]" />
              </div>
              <h2 className="mt-5 font-geist font-bold text-xl tracking-tight">
                {solution.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {solution.who}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
                {solution.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
              <Link
                href={`/docs/${solution.doc.slug}`}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline mt-auto pt-6"
              >
                {solution.doc.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-card border border-primary/25 bg-primary/[0.04] p-6 sm:p-10 text-center">
          <h2 className="font-geist font-black text-2xl sm:text-3xl tracking-tight">
            Join 10 businesses already selling this way
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Shops across Bangladesh run their chats, catalogs, and orders on{" "}
            {COMPANY_NAME} — and more join every week. Your store can be live
            before dinner.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95 w-full sm:w-auto"
            >
              Start Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95 w-full sm:w-auto"
            >
              Read the setup guide
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
