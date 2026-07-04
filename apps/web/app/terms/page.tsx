'use client';

import Link from 'next/link';
import { ArrowLeft, Scale, Shield, AlertTriangle, FileCheck, HelpCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col justify-between">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
              <defs>
                <linearGradient id="logo-grad-terms" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <path
                d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                fill="url(#logo-grad-terms)"
              />
            </svg>
            <div className="flex flex-col">
              <span className="font-geist font-black text-xl tracking-tight text-foreground group-hover:opacity-90 transition-opacity leading-none">
                Oryxa
              </span>
              <span className="text-[8px] font-geist font-extrabold text-muted-foreground uppercase tracking-widest mt-0.5 leading-none">
                by RR Computer
              </span>
            </div>
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
      <main className="relative min-h-[calc(100vh-8rem)] flex-1 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none -z-10" />
        
        <div className="w-full max-w-3xl bg-card border border-border/50 rounded-card shadow-card p-6 sm:p-10 relative z-10 space-y-8">
          
          {/* Header section */}
          <div className="flex flex-col sm:flex-row items-center gap-4 border-b border-border/40 pb-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Scale className="h-6 w-6 stroke-[2]" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="font-geist font-black text-3xl tracking-tight text-foreground">
                Terms &amp; Conditions
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Last Updated: July 4, 2026 • Oryxa is a product of RR Computer
              </p>
            </div>
          </div>

          {/* Terms Text */}
          <div className="space-y-6 text-sm text-muted-foreground leading-relaxed font-inter">
            <p>
              Welcome to Oryxa! These Terms &amp; Conditions ("Terms") govern your access to and use of Oryxa ("the Platform"), a multi-tenant AI auto-reply e-commerce SaaS application. The Platform is owned, developed, and operated by <strong>RR Computer</strong>. By registering an account, connecting channels, or using the Platform, you agree to comply with and be bound by these Terms.
            </p>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Shield className="h-4.5 w-4.5 text-primary" />
                <h2>1. Account Registration and Security</h2>
              </div>
              <p>
                To access features like product listing, order management, and agent customization, you must create a merchant account.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Authentication is managed securely through Firebase Auth. You are solely responsible for keeping your login credentials confidential.</li>
                <li>You agree to notify support immediately of any unauthorized access to your account.</li>
                <li>RR Computer is not liable for losses caused by unauthorized use of your credentials.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <FileCheck className="h-4.5 w-4.5 text-primary" />
                <h2>2. Channel Integration &amp; Compliance</h2>
              </div>
              <p>
                Oryxa connects to third-party social platforms (Facebook Messenger, Instagram, WhatsApp) to auto-reply to customers.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You must comply with Meta's developer and platform policies, terms of service, and messaging policies.</li>
                <li>You must only connect social accounts and pages that you own or have legal authorization to manage and connect.</li>
                <li>You acknowledge that Meta webhook events are verified and signatures validated using HMAC keys. Deactivation or removal of pages will terminate webhook event delivery.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <AlertTriangle className="h-4.5 w-4.5 text-primary" />
                <h2>3. AI Agents &amp; Limitations of Service</h2>
              </div>
              <p>
                Our AI agents run on LangGraph and Gemini LLM tools to talk to customers and manage carts/orders:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>AI responses are generated programmatically and dynamically. While we strive to optimize prompts, RR Computer does not guarantee 100% accuracy of AI auto-replies.</li>
                <li>You are responsible for regularly reviewing your agents' conversations and correcting product lists, stocks, or pricing data to prevent incorrect orders.</li>
                <li>Service is provided "as is" and "as available". We are not responsible for Gemini or Meta API service outages, rate-limiting, or token exhaustion.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <HelpCircle className="h-4.5 w-4.5 text-primary" />
                <h2>4. Intellectual Property</h2>
              </div>
              <p>
                All rights, titles, and interests in the Oryxa platform, its database schemas, backend code (Hono framework), agent configurations, web app layouts, designs, and brand logos are and remain the exclusive intellectual property of <strong>RR Computer</strong> and its licensors. You may not copy, modify, distribute, or reverse-engineer the source code.
              </p>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-6">
              <h2 className="text-foreground font-geist font-bold text-base">5. Governing Law and Support</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of Bangladesh. Any dispute arising from these terms shall be settled exclusively in the competent courts of Dhaka, Bangladesh.
              </p>
              <p className="mt-2">
                For questions regarding billing, enterprise terms, or service complaints, contact the RR Computer team at:
              </p>
              <div className="bg-muted/40 rounded-lg p-4 border border-border/40 space-y-1 mt-2 text-xs text-muted-foreground">
                <p><strong className="text-foreground">RR Computer - Software Division</strong></p>
                <p>Email: alamsarwar@hotmail.com</p>
                <p>
                  Address:<br />
                  51, Mirpur Road<br />
                  Room 517, Alpana Plaza, Level 5<br />
                  Dhaka 1205<br />
                  Bangladesh
                </p>
              </div>
            </section>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between border-t border-border/40 pt-6 mt-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-element border border-border bg-card hover:bg-muted text-foreground font-geist font-bold text-xs tracking-wide transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 stroke-[2.5]" /> Back to Home
            </Link>
            
            <Link
              href="/privacy"
              className="text-xs text-primary hover:underline font-semibold"
            >
              Read Privacy Policy
            </Link>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground bg-background/50">
        © 2026 Oryxa. A product of RR Computer. All rights reserved.
      </footer>
    </div>
  );
}
