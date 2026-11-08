/**
 * Ambient marketing backdrop for the home page: near-black base, a faint
 * perspective grid above the fold, and a soft bottom vignette. No color
 * washes — the page reads black and white with a single violet accent.
 * Also injects the scoped marketing-only stylesheet (all `oo-` classes,
 * disabled under prefers-reduced-motion) exactly once.
 */
const MARKETING_CSS = `
@keyframes oo-fade-up {
  from { opacity: 0; transform: translate3d(0, 22px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes oo-breathe {
  0%, 100% { opacity: .5; }
  50% { opacity: .95; }
}
@keyframes oo-sheen {
  0% { transform: translate3d(-150%, 0, 0); }
  55%, 100% { transform: translate3d(260%, 0, 0); }
}
.oo-reveal { opacity: 0; }
.oo-reveal.oo-in {
  animation: oo-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.oo-breathe { animation: oo-breathe 8s ease-in-out infinite; }
.oo-sheen {
  animation: oo-sheen 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .oo-reveal { opacity: 1 !important; animation: none !important; }
  .oo-breathe, .oo-sheen { animation: none !important; }
}
`;

export function GlowBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0B0C0F]"
    >
      {/* Faint perspective grid, fading out below the fold */}
      <div
        className="absolute inset-x-0 top-0 h-[900px] opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 50% 0%, black 25%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 0%, black 25%, transparent 78%)',
        }}
      />

      {/* Soft vignette to sink the edges */}
      <div className="absolute inset-x-0 bottom-0 h-[38vh] bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}

export function MarketingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />;
}
