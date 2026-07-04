'use client';

import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Mail, Lock, Eye, FileText } from 'lucide-react';
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
              <ShieldCheck className="h-6 w-6 stroke-[2]" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="font-geist font-black text-3xl tracking-tight text-foreground">
                Privacy Policy
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Last Updated: July 4, 2026 • Oryxa is a product of RR Computer
              </p>
            </div>
          </div>

          {/* Privacy Text */}
          <div className="space-y-6 text-sm text-muted-foreground leading-relaxed font-inter">
            <p>
              At Oryxa, we are committed to protecting your privacy. This Privacy Policy explains how Oryxa (referred to as "we," "us," or "our"), a specialized product of <strong>RR Computer</strong>, collects, uses, processes, and protects your information when you use our multi-tenant SaaS platform, websites, and integrations.
            </p>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Eye className="h-4.5 w-4.5 text-primary" />
                <h2>1. Information We Collect</h2>
              </div>
              <p>
                To provide our AI auto-reply and sales agent features, we collect information from both merchants and end-customers:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Merchant Account Data:</strong> Registration and authentication information, including name, email address, password hashes (managed securely via Firebase Auth), and billing details.</li>
                <li><strong>Social Platform Access Tokens:</strong> When you connect a social platform (e.g., Facebook Messenger, Instagram, WhatsApp), we securely store the Page Access Tokens required to read messages and post replies.</li>
                <li><strong>Conversation Logs:</strong> We store communication transcripts, including user messages, AI agent responses, product inquiries, cart statuses, and order details, to process auto-replies and show performance analytics.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Lock className="h-4.5 w-4.5 text-primary" />
                <h2>2. How We Use and Process Data</h2>
              </div>
              <p>
                We use the collected information for the following business operations:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Providing the LangGraph &amp; Gemini AI-driven automated chat sales services.</li>
                <li>Creating and managing product carts, checking stock availability, and creating merchant orders directly from conversation streams.</li>
                <li>Displaying performance metrics, response speed analytics, and message counts in the merchant dashboard.</li>
                <li>Ensuring security, debugging system issues, and preventing fraudulent usage.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <FileText className="h-4.5 w-4.5 text-primary" />
                <h2>3. Data Sharing and Third-Party API Integrations</h2>
              </div>
              <p>
                We do not sell merchant or customer data. To deliver Oryxa's core functionality, data is processed through the following secure third-party systems:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Meta APIs (Facebook &amp; Instagram):</strong> We fetch messages and dispatch AI replies via the Meta Graph Send API.</li>
                <li><strong>Google Gemini API:</strong> Message payloads are processed through Gemini LLM services to generate smart customer responses.</li>
                <li><strong>Firebase Admin SDK:</strong> Used for secure auth session verification.</li>
                <li><strong>Cloud Storage (Backblaze B2):</strong> To securely cache and serve product catalog and variant images.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Mail className="h-4.5 w-4.5 text-primary" />
                <h2>4. Data Deletion and Deactivation</h2>
              </div>
              <p>
                Merchants retain full control over their integrations. When you disconnect a Facebook Page or delete a channel from Oryxa:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>We automatically call Meta APIs to unsubscribe our webhook from your Page events.</li>
                <li>Associated social access tokens and credentials are deleted or deactivated within our database.</li>
                <li>Merchants may request a complete hard delete of their business workspace, product lists, and historical conversation histories by contacting support.</li>
              </ul>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-6">
              <h2 className="text-foreground font-geist font-bold text-base">5. Contact Support</h2>
              <p>
                If you have questions about this policy, or if you need to request data deletion under GDPR/CCPA regulations, you can follow our <Link href="/data-delete-instructions" className="text-primary hover:underline font-semibold">Data Deletion Instructions</Link> or contact us at:
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
              href="/terms"
              className="text-xs text-primary hover:underline font-semibold"
            >
              Read Terms &amp; Conditions
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
