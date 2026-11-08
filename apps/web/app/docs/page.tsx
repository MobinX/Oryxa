import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBrand } from "@/lib/brand-server";
import { PublicFooterLinks } from "@/components/legal/public-footer-links";
import { getDocsArticles } from "@/lib/docs-content";

/** Brand comes from request headers, so this route opts out of instant prerendering. */
export const instant = false;

const GROUPS: Array<{ heading: string; slugs: string[] }> = [
  { heading: "Setup", slugs: ["getting-started"] },
  {
    heading: "Channels",
    slugs: ["connect-facebook-instagram", "connect-whatsapp"],
  },
  {
    heading: "Selling",
    slugs: [
      "catalog-products",
      "ai-auto-replies",
      "inbox-orders",
      "storefront",
    ],
  },
  { heading: "Account", slugs: ["plans-billing", "faq"] },
];

export default async function DocsPage() {
  const { companyName: COMPANY_NAME } = await getBrand();
  const articles = getDocsArticles(COMPANY_NAME);
  const bySlug = new Map(articles.map((a) => [a.slug, a]));

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
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <BookOpen className="h-3.5 w-3.5" /> Documentation
          </p>
          <h1 className="mt-3 font-geist font-black text-3xl sm:text-4xl tracking-tight">
            Learn {COMPANY_NAME} in an afternoon
          </h1>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Short, practical guides: connect your channels, load your catalog,
            switch on AI replies, and fulfil the orders that follow. Start at
            the top and work down.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <nav aria-label="Guides" className="lg:sticky lg:top-24 self-start">
            <ul className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {articles.map((article, i) => (
                <li key={article.slug} className="shrink-0">
                  <Link
                    href={`/docs/${article.slug}`}
                    className="flex items-center gap-2.5 rounded-element border border-border/60 bg-card px-3.5 py-2.5 text-sm font-semibold hover:border-primary/50 hover:text-primary transition-colors whitespace-nowrap lg:whitespace-normal"
                  >
                    <span className="text-xs font-black text-primary/70 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Cards */}
          <div className="space-y-10">
            {GROUPS.map((group) => (
              <section key={group.heading} aria-label={group.heading}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {group.heading}
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {group.slugs.map((slug) => {
                    const article = bySlug.get(slug);
                    if (!article) return null;
                    return (
                      <Link
                        key={slug}
                        href={`/docs/${slug}`}
                        className="group rounded-card border border-border/60 bg-card p-5 sm:p-6 shadow-card hover:border-primary/50 hover:shadow transition-all"
                      >
                        <h3 className="font-geist font-bold text-lg tracking-tight group-hover:text-primary transition-colors">
                          {article.title}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {article.description}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                          Read guide
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="mt-12 flex justify-start">
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
        <PublicFooterLinks />
      </footer>
    </div>
  );
}
