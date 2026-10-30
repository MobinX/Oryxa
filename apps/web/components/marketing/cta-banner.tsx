import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/marketing/primitives';

export function CtaBanner() {
  return (
    <Reveal className="px-4 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0B0D16]/80 px-6 py-14 text-center shadow-[0_50px_140px_-50px_rgba(91,61,245,0.55)] backdrop-blur-xl sm:px-12">
        <div
          aria-hidden
          className="oo-breathe pointer-events-none absolute -top-40 left-1/2 h-80 w-[min(640px,120vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(91,61,245,0.35),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#A78BFA]/70 to-transparent"
        />

        <div className="relative space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/30 bg-[#5B3DF5]/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A78BFA]">
            <Sparkles className="h-3.5 w-3.5" />
            Free plan, no card required
          </span>
          <h2 className="mx-auto max-w-2xl font-geist text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[44px] lg:leading-[1.12]">
            Put tomorrow&rsquo;s orders{' '}
            <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#818CF8] bg-clip-text text-transparent">
              on autopilot
            </span>
          </h2>
          <p className="mx-auto max-w-xl text-balance text-sm leading-relaxed text-slate-400 sm:text-base">
            Connect your first channel, import your catalog and watch the AI
            start closing chats tonight.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_-10px_rgba(91,61,245,0.9)] transition hover:brightness-110 active:scale-97 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70"
            >
              Start selling free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#workflow"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
            >
              See the demo again
            </a>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
