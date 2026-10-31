import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Scale,
  Shield,
  AlertTriangle,
  FileCheck,
  HelpCircle,
  UserCheck,
  BookOpen,
  Bot,
  Ban,
  PlugZap,
  ShoppingBag,
  CreditCard,
  Copyright,
  Eye,
  Gavel,
  LogOut,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { getBrand } from '@/lib/brand-server';
import { supportEmailForHost } from '@/lib/brand';

/** Brand copy comes from request headers, so this route may block. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getBrand();
  return {
    title: `Terms — ${companyName}`,
    description: `Terms and conditions for using ${companyName}: accounts, acceptable use, AI replies, orders, liability and contact.`,
    alternates: { canonical: '/terms' },
  };
}

export default async function TermsPage() {
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
              <Scale className="h-6 w-6 stroke-[2]" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="font-geist font-black text-3xl tracking-tight text-foreground">
                Terms &amp; Conditions
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Last Updated: October 31, 2026 • {operator}
              </p>
            </div>
          </div>

          {/* Terms Text */}
          <div className="space-y-6 text-sm text-muted-foreground leading-relaxed font-inter">
            <p>
              Welcome to {companyName}! These Terms &amp; Conditions (&quot;Terms&quot;) govern your
              access to and use of {companyName} (&quot;the Platform&quot;), a multi-tenant
              software service for AI-powered customer replies, catalog and order management,
              storefronts, and messaging integrations. The Platform is owned, developed, and
              operated by {operator}. By registering an account, connecting a channel, or
              otherwise using the Platform, you agree to comply with and be bound by these
              Terms. If you do not agree, do not use the Platform.
            </p>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <UserCheck className="h-4.5 w-4.5 text-primary" />
                <h2>1. Acceptance of Terms and Eligibility</h2>
              </div>
              <p>
                To use the Platform you must be at least 18 years old and legally capable of
                entering a binding agreement. If you register on behalf of a business, you
                represent that you have the authority to bind that business to these Terms, and
                &quot;you&quot; then refers to that business. We may refuse service, close
                accounts, or require additional verification where we reasonably believe these
                requirements are not met.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <BookOpen className="h-4.5 w-4.5 text-primary" />
                <h2>2. Definitions</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Platform / Service:</strong> the {companyName} software, websites, dashboards, storefronts, and integrations described in Section 4.</li>
                <li><strong>Merchant:</strong> a business or individual holding an account and using the Platform to serve its own customers.</li>
                <li><strong>Customer:</strong> an end user who interacts with a merchant through connected channels or storefronts.</li>
                <li><strong>Content:</strong> catalog data, messages, images, and other material a merchant or its customers submit to the Platform.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Shield className="h-4.5 w-4.5 text-primary" />
                <h2>3. Account Registration, Credentials, and Security</h2>
              </div>
              <p>
                To access features such as product listings, order management, and agent
                customization, you must create a merchant account with accurate and complete
                information and keep it up to date.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Authentication is handled through a secure third-party identity provider. You are solely responsible for keeping your login credentials confidential.</li>
                <li>You are responsible for all activity that occurs under your account, whether or not you authorized it.</li>
                <li>You agree to notify support immediately of any unauthorized access to your account.</li>
                <li>We are not liable for losses caused by unauthorized use of your credentials, to the extent permitted by law.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Bot className="h-4.5 w-4.5 text-primary" />
                <h2>4. Description of the Service</h2>
              </div>
              <p>The Platform provides, where applicable:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>AI-generated replies to customer comments and direct messages on connected channels.</li>
                <li>Catalog, stock, cart, and order management tools for merchants.</li>
                <li>Hosted storefront pages where customers can browse and buy.</li>
                <li>Notifications, analytics, and related integrations described in your plan.</li>
              </ul>
              <p>
                Features vary by plan and region. We may add, modify, or retire features with
                reasonable notice where practical, as described in Section 14.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Ban className="h-4.5 w-4.5 text-primary" />
                <h2>5. Acceptable Use</h2>
              </div>
              <p>You agree not to use the Platform to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Send spam, bulk unsolicited messages, or harassing, hateful, or unlawful content.</li>
                <li>Violate any applicable law or the policies of connected third-party platforms.</li>
                <li>Attempt unauthorized access to accounts, systems, or data, or reverse-engineer the Platform except where the law expressly allows it.</li>
                <li>Resell, sublicense, or redistribute the Service without written permission, or abuse quotas and rate limits.</li>
                <li>Infringe intellectual property or privacy rights, or upload malicious code.</li>
              </ul>
              <p>
                We may investigate suspected violations and take proportionate action, including
                suspending the offending feature or account as described in Section 13.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <PlugZap className="h-4.5 w-4.5 text-primary" />
                <h2>6. Third-Party Platforms and Integrations</h2>
              </div>
              <p>
                {companyName} connects to third-party services — including social and messaging
                platforms, payment processors, hosting, storage, and AI providers — to deliver
                its features. You must comply with those providers&apos; terms, developer
                policies, and messaging rules (including Meta&apos;s platform and messaging
                policies where you connect its services).
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You must only connect accounts and pages that you own or are legally authorized to manage.</li>
                <li>Deactivating or removing a connected page may stop webhook event delivery for that page.</li>
                <li>We are not responsible for outages, policy changes, rate limits, or enforcement actions by third-party providers.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <ShoppingBag className="h-4.5 w-4.5 text-primary" />
                <h2>7. Merchant Responsibilities</h2>
              </div>
              <p>
                As a merchant, you are the seller of record for your own products and services.
                You are solely responsible for:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>The accuracy of product listings, pricing, stock levels, and availability.</li>
                <li>Order fulfillment, delivery, shipping, payments, refunds, and returns.</li>
                <li>Customer service toward your own customers and compliance with consumer-protection, tax, and other applicable laws.</li>
                <li>Reviewing AI-assisted replies and catalog data so customers do not receive incorrect commitments.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <AlertTriangle className="h-4.5 w-4.5 text-primary" />
                <h2>8. AI Limitations</h2>
              </div>
              <p>
                AI-generated replies are produced automatically and may be inaccurate,
                incomplete, or out of date. We do not guarantee any particular level of
                accuracy, and you should treat AI output as a draft aid rather than a final
                answer. You remain responsible for reviewing automated replies and for any
                commitments made to your customers, including prices, stock, and delivery
                promises.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <CreditCard className="h-4.5 w-4.5 text-primary" />
                <h2>9. Plans, Billing, and Refunds</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Paid features are billed according to the plan you select. Fees, quotas, and renewal terms are shown before you confirm a subscription.</li>
                <li>You authorize us and our payment processors to charge the payment method on file for recurring fees until you cancel.</li>
                <li>Unpaid or disputed invoices may lead to restricted features or suspension after reasonable notice.</li>
                <li>Refund requests are handled case by case under our refund approach and applicable consumer law; contact support for billing questions.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Copyright className="h-4.5 w-4.5 text-primary" />
                <h2>10. Intellectual Property</h2>
              </div>
              <p>
                All rights, title, and interest in the Platform — including its software,
                database schemas, agent configurations, layouts, designs, and brand assets —
                are and remain the exclusive property of {operator} and its licensors. You
                may not copy, modify, distribute, or reverse-engineer the Platform except
                where the law expressly allows it.
              </p>
              <p>
                You retain ownership of your Content. By using the Platform you grant us a
                limited, non-exclusive license to host, process, and display that Content
                solely to provide and improve the Service for you.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Eye className="h-4.5 w-4.5 text-primary" />
                <h2>11. Privacy</h2>
              </div>
              <p>
                How we collect, use, share, and protect personal data is described in our{' '}
                <Link href="/privacy" className="text-primary hover:underline font-semibold">
                  Privacy Policy
                </Link>
                , which forms part of these Terms. Data removal options are explained in the{' '}
                <Link href="/data-delete-instructions" className="text-primary hover:underline font-semibold">
                  Data Deletion Instructions
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Gavel className="h-4.5 w-4.5 text-primary" />
                <h2>12. Disclaimers, Limitation of Liability, and Indemnity</h2>
              </div>
              <p>
                The Service is provided &quot;as is&quot; and &quot;as available&quot; without
                warranties of any kind, whether express or implied, to the fullest extent
                permitted by law. We do not warrant uninterrupted availability, freedom from
                errors, or any particular business outcome.
              </p>
              <p>
                To the maximum extent permitted by law, {operator} and its affiliates will
                not be liable for indirect, incidental, special, consequential, or punitive
                damages, or for loss of profits, revenue, or data arising from your use of
                the Service. Our total liability for any claim is limited to the fees you
                paid for the Service in the twelve months before the claim arose, or the
                minimum amount the law requires where a cap is not allowed.
              </p>
              <p>
                You agree to indemnify and hold us harmless from claims, damages, and
                expenses arising from your Content, your use of the Service, or your breach
                of these Terms.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <LogOut className="h-4.5 w-4.5 text-primary" />
                <h2>13. Suspension and Termination</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You may stop using the Service and close your account at any time, subject to any outstanding fees.</li>
                <li>We may suspend or terminate access, with reasonable notice where practical, for Terms violations, unpaid fees, suspected fraud or abuse, legal obligations, or prolonged inactivity.</li>
                <li>On termination, your right to use the Service ends immediately. Sections that by nature should survive — including intellectual property, disclaimers, liability limits, and governing law — continue to apply.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <RefreshCw className="h-4.5 w-4.5 text-primary" />
                <h2>14. Changes to the Service and Terms</h2>
              </div>
              <p>
                We may update the Service and these Terms from time to time. Material changes
                will be communicated through the Platform or by email where practical, and the
                &quot;Last Updated&quot; date above will always reflect the current version.
                Continued use of the Service after changes take effect constitutes acceptance
                of the updated Terms.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <FileCheck className="h-4.5 w-4.5 text-primary" />
                <h2>15. Governing Law and Dispute Resolution</h2>
              </div>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of
                Bangladesh. Any dispute arising from these Terms shall be settled exclusively
                in the competent courts of Dhaka, Bangladesh. Before pursuing formal
                proceedings, you agree to contact support so we can attempt an informal
                resolution.
              </p>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-6">
              <div className="flex items-center gap-2 text-foreground font-geist font-bold text-base">
                <Mail className="h-4.5 w-4.5 text-primary" />
                <h2>16. Contact</h2>
              </div>
              <p>
                For questions about these Terms, billing, or service complaints, contact us at:
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
              <p className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                For data removal requests, see the{' '}
                <Link href="/data-delete-instructions" className="text-primary hover:underline font-semibold">
                  Data Deletion Instructions
                </Link>
                .
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
        {companyName === parentCompanyName
          ? `© 2026 ${companyName}. All rights reserved.`
          : `© 2026 ${companyName}. A product of ${parentCompanyName}. All rights reserved.`}
      </footer>
    </div>
  );
}
