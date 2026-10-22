/**
 * Ambient marketing backdrop shared by the OnlyOrders home page.
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
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#08090A]"
    >
      {/* Top ambient halo */}
      <div className="oo-breathe absolute -top-[300px] left-1/2 h-[760px] w-[min(1150px,160vw)] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(91,61,245,0.28),rgba(124,58,237,0.10)_55%,transparent_100%)] blur-2xl" />

      {/* Faint perspective grid, fading out below the fold */}
      <div
        className="absolute inset-x-0 top-0 h-[900px] opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 50% 0%, black 25%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 0%, black 25%, transparent 78%)',
        }}
      />

      {/* Mid-page side glows */}
      <div className="absolute left-[-240px] top-[46%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(91,61,245,0.10),transparent)] blur-3xl" />
      <div className="absolute right-[-260px] top-[72%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(124,58,237,0.09),transparent)] blur-3xl" />

      {/* Film-free soft vignette to sink the edges */}
      <div className="absolute inset-x-0 bottom-0 h-[38vh] bg-gradient-to-t from-[#060709] to-transparent" />
    </div>
  );
}

export function MarketingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />;
}
