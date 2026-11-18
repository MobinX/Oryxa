"use client";

import Link from "next/link";
import { ArrowLeft, Plug, ShieldCheck, Webhook } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBrand } from "@/components/brand-provider";

const STEPS = [
  {
    icon: Plug,
    title: "1. Connect a channel",
    body: "Link your Facebook Page, Instagram business account or WhatsApp business number from inside the product with a guided OAuth flow — no code, no developer account setup on your side.",
  },
  {
    icon: Webhook,
    title: "2. Webhooks handled for you",
    body: "Subscriptions, verification and event delivery for Messenger, Instagram and the WhatsApp Cloud API are configured automatically when you connect. Messages simply start arriving in your inbox.",
  },
  {
    icon: ShieldCheck,
    title: "3. Your data stays yours",
    body: "Conversation data is used to run your store, never to train shared models. You can request deletion of your data at any time — see the data-deletion instructions for how.",
  },
];

const CHANNELS = [
  {
    name: "Facebook Messenger",
    body: "Auto-replies to Page messages and post comments, with order capture and handoff to your team.",
    href: "/docs/connect-facebook-instagram",
  },
  {
    name: "Instagram",
    body: "Answers DMs and story-mention messages from your business account, grounded in your live catalog.",
    href: "/docs/connect-facebook-instagram",
  },
  {
    name: "WhatsApp",
    body: "Runs on the WhatsApp Cloud API with a business number you control, including verification-code onboarding.",
    href: "/docs/connect-whatsapp",
  },
];

export default function DevelopersPage() {
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
                  id="logo-grad-dev"
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
                fill="url(#logo-grad-dev)"
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
            Developer Hub
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            {COMPANY_NAME} connects to the official Meta messaging APIs so your
            store can sell inside the apps your customers already use. There is
            no public REST API yet — integrations run through channel
            connections inside the product. For API access or partnerships,
            contact us.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.title}
              className="bg-card border border-border/50 rounded-card p-6 shadow-card"
            >
              <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                <s.icon className="h-5 w-5 stroke-[1.75]" />
              </div>
              <h2 className="mt-4 font-geist font-bold text-lg tracking-tight">
                {s.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-center font-geist font-black text-2xl tracking-tight">
          Supported channels
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="group bg-card border border-border/50 rounded-card p-6 shadow-card hover:shadow transition-shadow"
            >
              <h3 className="font-geist font-bold text-lg tracking-tight group-hover:text-primary transition-colors">
                {c.name}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {c.body}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center bg-card border border-border/50 rounded-card p-8 sm:p-10 max-w-2xl mx-auto">
          <h2 className="font-geist font-black text-2xl tracking-tight">
            Building something custom?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Tell us what you want to integrate — custom channels, bulk catalog
            sync, or order webhooks. Include your account email and business
            name.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center h-11 px-6 rounded-element bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95"
            >
              Contact us
            </Link>
            <Link
              href="/data-delete-instructions"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5] rotate-180" /> Data
              &amp; privacy
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm hover:shadow active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5]" /> Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground bg-background/50">
        © 2026 {COMPANY_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
