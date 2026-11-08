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

/** Small neutral eyebrow pill above section headings. */
export function Eyebrow({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
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
  gradient,
  copy,
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
          {gradient ? <span className="text-[#A78BFA]">{gradient}</span> : null}
        </h2>
      </Reveal>
      {copy ? (
        <Reveal delayMs={120}>
          <p className="mx-auto max-w-2xl text-balance text-sm leading-relaxed text-neutral-400 sm:text-base">
            {copy}
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}

/** Hairline panel with a neutral hover lift. */
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
    <div className="relative rounded-3xl border border-white/25 bg-[#101114] p-6 shadow-2xl">
      <div className={cn(className)}>{children}</div>
    </div>
  ) : (
    <div
      className={cn(
        'group relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition duration-300',
        'hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.05]',
        className,
      )}
    >
      {children}
    </div>
  );
}
