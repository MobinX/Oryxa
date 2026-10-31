import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Mail,
  Lock,
  Building2,
  Database,
  Inbox,
  Target,
  Scale,
  Share2,
  Globe,
  CalendarClock,
  UserCheck,
  Cookie,
  Baby,
  RefreshCw,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { getBrand } from '@/lib/brand-server';
import { supportEmailForHost } from '@/lib/brand';

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Privacy — ${companyName}`,
    description: `Privacy policy for ${companyName}: what data is collected, how it is used and shared, retention, rights and contact.`,
    alternates: { canonical: '/privacy' },
  };
}

/** Brand copy comes from request headers, so this route may block. */
export const instant = false;

export default async function PrivacyPage() {
  const brand = await getBrand();
  const { companyName, parentCompanyName } = brand;
  const supportEmail = supportEmailForHost(brand.host);
  const operator =
    companyName === parentCompanyName
      ? companyName
      : `${companyName}, a product of ${parentCompanyName}`;

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
                {companyName}
              </span>
              {companyName === parentCompanyName ? null : (
                <span className="text-[8px] font-geist font-extrabold text-muted-foreground uppercase tracking-widest mt-0.5 leading-none">
                  by {parentCompanyName}
                </span>
              )}
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
                Last Updated: October 31, 2026 • {operator}
              </p>
            </div>
          </div>

          {/* Privacy Text */}
          <div className="space-y-6 text-sm text-muted-foreground leading-relaxed font-inter">
            <p>
              At {companyName}, we are committed to protecting your privacy. This Privacy
              Policy explains how {operator} (&quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) collects, uses, shares, and safeguards information when you
              use our multi-tenant software platform, websites, storefronts, and
              integrations. It applies to merchants who hold accounts with us and, where
              applicable, to the customers who interact with those merchants through the
              Platform.
            </p>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Building2 className="h-4.5 w-4.5 text-primary" />
                <h2>1. Who Controls Your Data</h2>
              </div>
              <p>
                {operator} operates the {companyName} service and decides how account-level
                data is processed. Merchants act as independent controllers of their own
                customer relationships: when you buy from or message a merchant&apos;s
                store, that merchant is responsible for its own privacy practices toward you,
                and we process your interactions on the merchant&apos;s behalf to deliver
                the service.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Database className="h-4.5 w-4.5 text-primary" />
                <h2>2. Categories of Data We Handle</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Account and business details:</strong> name, email address, authentication identifiers, and business profile information.</li>
                <li><strong>Catalog and order data:</strong> products, variants, prices, stock levels, carts, and order records.</li>
                <li><strong>Messages and comments:</strong> customer conversations, comments, and contact details customers share in chats.</li>
                <li><strong>Media:</strong> photos, product images, and voice notes exchanged through connected channels, where applicable.</li>
                <li><strong>Usage, device, and log data:</strong> pages visited, actions taken, device and browser characteristics, and diagnostic logs.</li>
                <li><strong>Billing metadata:</strong> plan selections and payment status information (payment credentials themselves are handled by our payment processors).</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Inbox className="h-4.5 w-4.5 text-primary" />
                <h2>3. How Data Is Collected</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Directly from merchants:</strong> account signup, dashboard input, catalog uploads, and settings.</li>
                <li><strong>From customer interactions:</strong> messages, comments, and orders on connected channels and storefronts.</li>
                <li><strong>Automatically:</strong> cookies and similar technologies, service logs, and analytics events.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Target className="h-4.5 w-4.5 text-primary" />
                <h2>4. How We Use Data</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Providing and operating the service, including AI-generated replies and order handling.</li>
                <li>Sending service notifications, security alerts, and administrative messages.</li>
                <li>Preventing fraud and abuse, debugging, and keeping the service secure and reliable.</li>
                <li>Measuring performance, improving features, and providing customer support.</li>
                <li>Processing billing and complying with legal obligations.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Scale className="h-4.5 w-4.5 text-primary" />
                <h2>5. Legal Bases</h2>
              </div>
              <p>
                Where data-protection law requires a legal basis, we rely on one or more of
                the following as applicable: performance of our contract with the merchant,
                our legitimate interests in operating and securing the service, compliance
                with legal obligations, and consent where it has been given and is required.
                Nothing in this policy claims blanket compliance with any specific regime;
                rights and bases always apply &quot;where applicable&quot; under the law
                that covers you.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Share2 className="h-4.5 w-4.5 text-primary" />
                <h2>6. Sharing With Processors and Third Parties</h2>
              </div>
              <p>
                We do not sell merchant or customer data. To deliver the service, data is
                processed through the following categories of providers:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Messaging platforms:</strong> Meta services (Facebook and Instagram) for fetching messages and dispatching replies.</li>
                <li><strong>AI and model providers:</strong> message payloads are processed to generate customer responses.</li>
                <li><strong>Hosting and database providers:</strong> application hosting and data storage.</li>
                <li><strong>File storage:</strong> hosting for catalog images and media.</li>
                <li><strong>Speech transcription:</strong> converting voice notes to text where the feature is used.</li>
                <li><strong>Authentication:</strong> secure sign-in session verification.</li>
                <li><strong>Notifications and analytics:</strong> push delivery and service measurement.</li>
              </ul>
              <p>
                We may also disclose information where required by law or to protect rights,
                safety, and the integrity of the service.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Globe className="h-4.5 w-4.5 text-primary" />
                <h2>7. International Transfers</h2>
              </div>
              <p>
                Our providers may process data in countries other than your own. Where
                transfers occur, we rely on appropriate safeguards where applicable, such as
                contractual protections and the security practices of established providers.
                If you have questions about a specific transfer, contact us using the details
                in Section 15.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <CalendarClock className="h-4.5 w-4.5 text-primary" />
                <h2>8. Data Retention and Deletion</h2>
              </div>
              <p>
                We keep data only for as long as needed to provide the service and for
                legitimate business purposes such as security, debugging, billing records,
                and legal compliance. When you disconnect a channel, associated access
                tokens are deleted or deactivated, and platform webhooks for that channel
                are unsubscribed. Merchants may request deletion of their workspace as
                described in Section 10 and in our{' '}
                <Link href="/data-delete-instructions" className="text-primary hover:underline font-semibold">
                  Data Deletion Instructions
                </Link>
                . Backups may persist for a limited period before being overwritten.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Lock className="h-4.5 w-4.5 text-primary" />
                <h2>9. Security Measures</h2>
              </div>
              <p>
                We apply reasonable technical and organizational safeguards, including
                encrypted connections, authenticated sessions, scoped access tokens, and
                least-privilege access to production systems. No method of transmission or
                storage is perfectly secure, so we cannot guarantee absolute security — but
                we work to protect data with practices proportionate to its sensitivity.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <UserCheck className="h-4.5 w-4.5 text-primary" />
                <h2>10. Your Rights</h2>
              </div>
              <p>
                Depending on the law that applies to you, you may have the right to request
                access to, correction of, or deletion of your personal data, and to object
                to or restrict certain processing. To exercise these rights, contact us
                using the details in Section 14. Customers of a merchant should contact that
                merchant directly in the first instance, since the merchant controls its own
                customer data. Deletion walkthroughs are also available in the{' '}
                <Link href="/data-delete-instructions" className="text-primary hover:underline font-semibold">
                  Data Deletion Instructions
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Cookie className="h-4.5 w-4.5 text-primary" />
                <h2>11. Cookies and Tracking Choices</h2>
              </div>
              <p>
                We use cookies and similar technologies for sign-in sessions, preferences,
                security, and service measurement. You can control cookies through your
                browser settings; blocking strictly necessary cookies may limit parts of the
                service. Where consent is required for optional tracking, we request it
                before enabling such features.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Baby className="h-4.5 w-4.5 text-primary" />
                <h2>12. Children&apos;s Privacy</h2>
              </div>
              <p>
                The service is a business tool and is not directed at children. We do not
                knowingly collect personal data from children. If you believe a child has
                provided us with personal data, contact us and we will take appropriate
                steps to remove it.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <RefreshCw className="h-4.5 w-4.5 text-primary" />
                <h2>13. Changes to This Policy</h2>
              </div>
              <p>
                We may update this policy as the service evolves. Material changes will be
                communicated through the Platform or by email where practical, and the
                &quot;Last Updated&quot; date above will always reflect the current version.
                Continued use of the service after changes take effect constitutes acceptance
                of the updated policy. Our{' '}
                <Link href="/terms" className="text-primary hover:underline font-semibold">
                  Terms &amp; Conditions
                </Link>{' '}
                apply alongside this policy.
              </p>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-6">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Mail className="h-4.5 w-4.5 text-primary" />
                <h2>14. Contact</h2>
              </div>
              <p>
                For privacy questions, rights requests, or data deletion inquiries, contact us at:
              </p>
              <div className="bg-muted/40 rounded-lg p-4 border border-border/40 space-y-1 mt-2 text-xs text-muted-foreground">
                <p><strong className="text-foreground">{operator}</strong></p>
                <p>
                  Email:{' '}
                  <Link href={`mailto:${supportEmail}`} className="text-primary hover:underline font-semibold">
                    {supportEmail}
                  </Link>
                </p>
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
        {companyName === parentCompanyName
          ? `© 2026 ${companyName}. All rights reserved.`
          : `© 2026 ${companyName}. A product of ${parentCompanyName}. All rights reserved.`}
      </footer>
    </div>
  );
}
