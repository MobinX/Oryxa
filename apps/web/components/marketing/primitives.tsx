'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-reveal wrapper for the marketing pages.
 * Reveals on intersection, with a fail-safe timer so content is never
 * stuck hidden (e.g. no observer support). Reduced-motion users get
 * static visible content via the shared marketing <style> rules.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);

    // Fail-safe: reveal even if the observer never fires.
    const fallback = setTimeout(() => setShown(true), 900);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
      className={cn('oo-reveal', shown && 'oo-in', className)}
    >
      {children}
    </div>
  );
}

/** Small glowing eyebrow pill above section headings. */
export function Eyebrow({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/30 bg-[#5B3DF5]/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A78BFA] shadow-[0_0_24px_-6px_rgba(91,61,245,0.5)]">
      {icon}
      {children}
    </span>
  );
}

/** Centered section heading block used across the marketing page. */
export function SectionHeading({
  eyebrow,
  icon,
  title,
  copy,
  gradient,
}: {
  eyebrow: string;
  icon?: ReactNode;
  title: string;
  gradient?: string;
  copy?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-center">
      <Reveal>
        <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delayMs={60}>
        <h2 className="font-geist text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
          {title}{' '}
          {gradient ? (
            <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#818CF8] bg-clip-text text-transparent">
              {gradient}
            </span>
          ) : null}
        </h2>
      </Reveal>
      {copy ? (
        <Reveal delayMs={120}>
          <p className="mx-auto max-w-2xl text-balance text-sm leading-relaxed text-slate-400 sm:text-base">
            {copy}
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}

/** Glass panel with soft violet hover glow. */
export function GlowCard({
  children,
  className,
  featured = false,
}: {
  children: ReactNode;
  className?: string;
  featured?: boolean;
}) {
  return featured ? (
    <div className="relative rounded-3xl p-px">
      <span
        aria-hidden
        className="absolute inset-0 rounded-3xl bg-gradient-to-b from-[#5B3DF5] via-[#7C3AED]/40 to-[#5B3DF5]/10"
      />
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-full bg-[#5B3DF5]/15 blur-3xl"
      />
      <div className={cn('relative rounded-[calc(1.5rem-1px)] bg-[#0C0E1A] p-6 shadow-2xl', className)}>
        {children}
      </div>
    </div>
  ) : (
    <div
      className={cn(
        'group relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition duration-300',
        'hover:-translate-y-1 hover:border-[#7C3AED]/50 hover:bg-[#5B3DF5]/[0.07] hover:shadow-[0_24px_60px_-24px_rgba(91,61,245,0.45)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
