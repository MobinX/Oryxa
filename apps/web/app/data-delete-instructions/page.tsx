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
              Oryxa, a product of <strong>RR Computer</strong>, values your control over your data. In compliance with Meta's developer regulations and standard privacy protocols, we provide clear instructions on how to delete your data or disconnect your channels.
            </p>

            {/* Primary Method: Highlighted */}
            <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/5 dark:bg-red-950/10 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-geist font-black text-lg">
                <Trash2 className="h-5.5 w-5.5" />
                <h2>Primary Method: Self-Service Permanent Data Deletion</h2>
              </div>
              <p className="text-foreground font-medium">
                This is the fastest and recommended way to completely delete all data associated with your business.
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-foreground/90">
                <li>Log in to your <strong>Oryxa Dashboard</strong>.</li>
                <li>In the left sidebar, navigate to the <strong>Settings</strong> page.</li>
                <li>Scroll down to the <strong>Danger zone</strong> section at the bottom.</li>
                <li>Click the red <strong>Delete My Data</strong> button.</li>
                <li>A confirmation modal will appear. Type your exact business name to confirm.</li>
                <li>Click <strong>Permanently Delete All Data</strong>.</li>
              </ol>
              <div className="text-xs text-muted-foreground bg-background/50 border border-border/40 rounded-lg p-3">
                ℹ️ <strong>What gets deleted:</strong> This instantly purges all product lists, categories, conversation logs, customer lists, order records, and AI agent configurations. It also automatically unsubscribes your connected Facebook page from our Meta app webhook subscriptions.
              </div>
            </div>

            {/* Extra Methods Section */}
            <div className="space-y-6 pt-4 border-t border-border/40">
              <h2 className="font-geist font-black text-xl text-foreground">
                Extra Methods (For more privacy)
              </h2>
              <p className="text-xs">
                These alternative options allow you to disconnect channels individually, revoke app-level Meta permissions, or request offline manual cleanup.
              </p>

              <div className="space-y-6 pl-1 border-l-2 border-primary/20">
                {/* Method 1 */}
                <section className="space-y-2 pl-4">
                  <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                    <Settings className="h-4 w-4 text-primary" />
                    <h3>Option A: Disconnect a Specific Page Channel</h3>
                  </div>
                  <p className="text-xs">
                    To stop the Oryxa AI agent from replying on a specific page without deleting your business profile completely:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1 text-xs">
                    <li>Go to the <strong>Channels</strong> section in the dashboard.</li>
                    <li>Click the <strong>Delete (Trash)</strong> icon next to the connected Facebook Page.</li>
                    <li>Confirm the removal. We will unsubscribe the page webhooks and remove the access tokens.</li>
                  </ol>
                </section>

                {/* Method 2 */}
                <section className="space-y-2 pl-4">
                  <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <h3>Option B: Revoke App Permissions via Facebook Account</h3>
                  </div>
                  <p className="text-xs">
                    To disconnect Oryxa directly from your Meta / Facebook account settings:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1 text-xs">
                    <li>Go to your Facebook Profile&apos;s <strong>Settings &amp; Privacy &gt; Settings</strong>.</li>
                    <li>In the left sidebar, click <strong>Apps and Websites</strong>.</li>
                    <li>Find <strong>Oryxa</strong> in the active list and click <strong>Remove</strong>.</li>
                  </ol>
                </section>

                {/* Method 3 */}
                <section className="space-y-2 pl-4">
                  <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                    <Mail className="h-4 w-4 text-primary" />
                    <h3>Option C: Email Data Deletion Request</h3>
                  </div>
                  <p className="text-xs">
                    If you cannot access your dashboard, you can request manual offline deletion of all records:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>Email: <strong className="text-foreground">alamsarwar@hotmail.com</strong></li>
                    <li>Subject: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">Oryxa Data Deletion Request</code></li>
                    <li>Include: your Business Name, account email address, and connected Facebook Page ID(s).</li>
                    <li>Processing time: <strong>7 business days</strong>.</li>
                  </ul>
                </section>
              </div>
            </div>

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
