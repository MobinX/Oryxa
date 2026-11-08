import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBrand } from "@/lib/brand-server";
import { socialMetadata } from "@/lib/seo";
import { PublicFooterLinks } from "@/components/legal/public-footer-links";
import { DOC_SLUGS, getDocsArticles } from "@/lib/docs-content";

/** Brand comes from request headers, so this route opts out of instant prerendering. */
export const instant = false;

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { companyName } = await getBrand();
  const article = getDocsArticles(companyName).find((a) => a.slug === slug);
  if (!article) return { robots: { index: false, follow: true } };
  const title = `${article.title} — ${companyName} Docs`;
  return {
    title,
    description: article.description,
    alternates: { canonical: `/docs/${slug}` },
    robots: { index: true, follow: true },
    ...socialMetadata({
      title,
      description: article.description,
      path: `/docs/${slug}`,
      siteName: companyName,
    }),
  };
}

export default async function DocsArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const { companyName: COMPANY_NAME } = await getBrand();
  const articles = getDocsArticles(COMPANY_NAME);
  const index = articles.findIndex((a) => a.slug === slug);
  if (index === -1) notFound();
  const article = articles[index];
  const prev = index > 0 ? articles[index - 1] : null;
  const next = index < articles.length - 1 ? articles[index + 1] : null;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-inter flex flex-col justify-between">
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

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 font-semibold hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> All guides
          </Link>
        </nav>

        <h1 className="mt-4 font-geist font-black text-3xl sm:text-4xl tracking-tight">
          {article.title}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
          {article.description}
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Updated {article.updated}
        </p>

        <div className="mt-8 space-y-10">
          {article.sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h2 className="font-geist font-bold text-xl tracking-tight">
                {section.heading}
              </h2>
              {section.body.map((paragraph, i) => (
                <p
                  key={i}
                  className="mt-3 text-muted-foreground leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
              {section.steps && (
                <ol className="mt-4 space-y-3">
                  {section.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-3.5 rounded-element border border-border/60 bg-card p-4"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-black tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed pt-0.5">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-card border border-primary/25 bg-primary/[0.04] p-6 sm:p-8 text-center">
          <h2 className="font-geist font-bold text-xl tracking-tight">
            Put this guide to work
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your free {COMPANY_NAME} account and follow along in your own
            dashboard.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-element bg-primary hover:bg-primary/90 text-primary-foreground font-geist font-bold text-sm tracking-wide transition-all shadow-sm active:scale-95"
          >
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <nav
          aria-label="More guides"
          className="mt-10 grid gap-4 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="rounded-element border border-border/60 bg-card p-4 hover:border-primary/50 transition-colors"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Previous
              </span>
              <span className="mt-1 block font-geist font-bold">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="rounded-element border border-border/60 bg-card p-4 text-right hover:border-primary/50 transition-colors"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Next
              </span>
              <span className="mt-1 block font-geist font-bold">
                {next.title}
              </span>
            </Link>
          )}
        </nav>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground bg-background/50">
        © 2026 {COMPANY_NAME}. All rights reserved.
        <PublicFooterLinks />
      </footer>
    </div>
  );
}
