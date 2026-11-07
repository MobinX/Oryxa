import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/marketing/primitives';

export function CtaBanner() {
  return (
    <Reveal className="px-4 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-[#101114] px-6 py-14 text-center shadow-2xl sm:px-12">
        <div className="relative space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
            <Sparkles className="h-3.5 w-3.5" />
            Free plan available
          </span>
          <h2 className="mx-auto max-w-2xl font-geist text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[44px] lg:leading-[1.12]">
            Put your customer chats on autopilot
          </h2>
          <p className="mx-auto max-w-xl text-balance text-sm leading-relaxed text-neutral-400 sm:text-base">
            Connect your first channel, import your catalog and see how the
            AI handles incoming chats.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-97 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Start selling free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#workflow"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-neutral-200 backdrop-blur transition hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              See the demo again
            </a>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
