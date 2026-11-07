import type { DisplayPlan } from '@/lib/plan-display';

export function LandingPricing({ plans, unavailable }: { plans: DisplayPlan[]; unavailable: boolean }) {
  return (
    <section id="pricing" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 96px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 14, color: 'var(--oo-accent)', fontWeight: 600 }}>Simple, transparent pricing</div>
      <h2
        style={{
          margin: '10px 0 14px',
          maxWidth: 640,
          fontSize: 48,
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 700,
        }}
      >
        Pick the plan that fits your store.
      </h2>
      <p style={{ margin: '0 0 48px', color: 'var(--oo-muted)', fontSize: 18 }}>
        Every plan ships with the core automation. Upgrade only when your orders are.
      </p>
      {plans.length === 0 ? (
        <div
          style={{
            padding: 28,
            borderRadius: 20,
            border: '1px solid var(--oo-line)',
            background: 'var(--oo-surface)',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--oo-muted)',
          }}
        >
          {unavailable ? 'Pricing is temporarily unavailable. Please check back shortly.' : 'No plans are published yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {plans.map((p) => {
            const hot = p.featured;
            const per = p.custom || p.priceCents === 0 ? '' : '/ month';
            const bullets = p.features.slice(0, 3);
            return (
              <div
                key={p.slug}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  padding: 28,
                  borderRadius: 20,
                  border: `1px solid ${hot ? 'var(--oo-accent)' : 'var(--oo-line)'}`,
                  background: 'var(--oo-surface)',
                  boxShadow: hot ? '0 20px 50px var(--oo-halo)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {p.badge ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'var(--oo-accent)',
                        color: '#fff',
                      }}
                    >
                      {p.badge}
                    </span>
                  ) : null}
                </div>
                <div>
                  <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.04em' }}>{p.priceLabel}</span>
                  {per ? <span style={{ color: 'var(--oo-muted)' }}> {per}</span> : null}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontSize: 14,
                    flexGrow: 1,
                    color: 'var(--oo-muted)',
                  }}
                >
                  {bullets.map((b) => (
                    <span key={b}>{b}</span>
                  ))}
                </div>
                <a
                  href={p.ctaHref}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 46,
                    borderRadius: 10,
                    border: `1px solid ${hot ? 'var(--oo-accent)' : 'var(--oo-line)'}`,
                    background: hot ? 'var(--oo-accent)' : 'transparent',
                    color: hot ? '#fff' : 'var(--oo-ink)',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {p.cta}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LandingCta() {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 96px', boxSizing: 'border-box' }}>
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          padding: '80px 32px',
          borderRadius: 28,
          border: '1px solid var(--oo-line)',
          background: 'var(--oo-surface)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '-60%',
            width: 800,
            height: 460,
            marginLeft: -400,
            background: 'radial-gradient(closest-side, var(--oo-halo), transparent)',
            pointerEvents: 'none',
          }}
        />
        <h2
          style={{
            position: 'relative',
            margin: '0 0 12px',
            fontSize: 44,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            fontWeight: 700,
          }}
        >
          Put your customer chats on autopilot
        </h2>
        <p style={{ position: 'relative', margin: '0 auto 28px', maxWidth: 520, color: 'var(--oo-muted)' }}>
          Connect your first channel, import your catalog and see how the AI handles incoming chats.
        </p>
        <a
          href="/login"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 50,
            padding: '0 26px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Start selling free
        </a>
      </div>
    </section>
  );
}

export function LandingFooter({ companyName }: { companyName: string }) {
  return (
    <footer
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        borderTop: '1px solid var(--oo-line)',
        padding: '28px 32px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 13,
        color: 'var(--oo-muted)',
        boxSizing: 'border-box',
      }}
    >
      <span>© 2026 {companyName}. All rights reserved.</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <a href="/privacy" style={{ color: 'var(--oo-muted)' }}>
          Privacy
        </a>
        <a href="/terms" style={{ color: 'var(--oo-muted)' }}>
          Terms
        </a>
        <a href="/cookies" style={{ color: 'var(--oo-muted)' }}>
          Cookies
        </a>
        <a href="/contact" style={{ color: 'var(--oo-muted)' }}>
          Contact
        </a>
      </span>
    </footer>
  );
}
