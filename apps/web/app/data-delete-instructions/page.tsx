'use client';

import Link from 'next/link';
import { ArrowLeft, Trash2, ShieldAlert, Mail, Settings, RefreshCw } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function DataDeleteInstructionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col justify-between">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <svg viewBox="0 0 32 32" className="w-8 h-8 select-none">
              <defs>
                <linearGradient id="logo-grad-del" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <path
                d="M16 8C12 8 8 11.5 8 16s4 8 8 8c3 0 5-1.5 6.5-3.5L25 18c-2 2.5-5 4-9 4-6 0-11-4.5-11-10S10 2 16 2c4 0 7 1.5 9 4l-2.5 2.5C21 6.5 19 8 16 8zm0 16c4 0 8-3.5 8-8s-4-8-8-8c-3 0-5 1.5-6.5 3.5L11 14c2-2.5 5-4 9-4 6 0 11 4.5 11 10s-5 10-11 10c-4 0-7-1.5-9-4l2.5-2.5c1.5 2 3.5 3.5 6.5 3.5z"
                fill="url(#logo-grad-del)"
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
            <div className="h-12 w-12 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center shrink-0">
              <Trash2 className="h-6 w-6 stroke-[2]" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="font-geist font-black text-3xl tracking-tight text-foreground">
                Data Deletion Instructions
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Step-by-step instructions on how to request or perform deletion of your account and connected data.
              </p>
            </div>
          </div>

          {/* Instructions Content */}
          <div className="space-y-6 text-sm text-muted-foreground leading-relaxed font-inter">
            <p>
              Oryxa, a product of <strong>RR Computer</strong>, values your control over your data. In compliance with Meta's developer regulations and standard privacy protocols, we provide clear instructions on how to disconnect your Facebook Page and request the permanent deletion of your stored information.
            </p>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Settings className="h-4.5 w-4.5 text-primary" />
                <h2>Method 1: Disconnect and Delete via the Oryxa Dashboard</h2>
              </div>
              <p>
                To disconnect your social channels and automatically revoke our access tokens, follow these steps:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Log in to your <strong>Oryxa Dashboard</strong>.</li>
                <li>Go to the <strong>Channels</strong> configuration section.</li>
                <li>Find the active Facebook Page or Instagram channel you wish to remove.</li>
                <li>Click the **Delete / Trash** icon.</li>
                <li>Confirm the deletion. This will automatically:
                  <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs">
                    <li>Unsubscribe our webhook subscription from your Page events.</li>
                    <li>Wipe the stored Facebook Page Access Token from our databases.</li>
                  </ul>
                </li>
              </ol>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <RefreshCw className="h-4.5 w-4.5 text-primary" />
                <h2>Method 2: Remove the Oryxa App from your Facebook Account</h2>
              </div>
              <p>
                If you wish to revoke Oryxa's access credentials directly from your Meta / Facebook account settings, follow these steps:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Go to your Facebook Profile's <strong>Settings & Privacy > Settings</strong>.</li>
                <li>In the left sidebar, navigate to <strong>Apps and Websites</strong>.</li>
                <li>Look for **Oryxa** in the list of active applications.</li>
                <li>Click the **Remove** button next to it.</li>
                <li>Confirm the removal. Facebook will cease supplying access tokens and delivery webhooks to our servers.</li>
              </ol>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Mail className="h-4.5 w-4.5 text-primary" />
                <h2>Method 3: Request Permanent Data Deletion</h2>
              </div>
              <p>
                Disconnecting your channels deactivates our API tokens, but does not immediately erase historical database logs (like conversation histories or product lists). If you wish to request a **permanent, complete hard-deletion** of all database records connected to your business workspace:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Send an email to: <strong className="text-foreground">alamsarwar@hotmail.com</strong></li>
                <li>Use the subject line: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">Oryxa Data Deletion Request</code></li>
                <li>Provide your **Business Name**, **Email Address** used for the account, and the **Facebook Page ID(s)** you connected.</li>
                <li>Our technical support team will process your request and permanently purge your records within <strong>7 business days</strong>. A confirmation email will be sent once the process is complete.</li>
              </ul>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-6">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
                <h2>Important Safety Note</h2>
              </div>
              <p className="text-xs">
                Please be aware that permanent data deletion is an irreversible action. Once your workspace, chat logs, order history, and product details are deleted from our servers, they cannot be recovered. Your custom-trained AI sales agent will immediately stop responding to customer messages.
              </p>
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
            
            <div className="flex gap-4 text-xs font-semibold text-primary">
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:underline">Terms & Conditions</Link>
            </div>
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
