'use client';

import type { DisplayPlan, PlanCompareRow } from '@/lib/plan-display';
import { useLandingLang } from './theme';

function compareCellColor(cell: string, featured: boolean): string {
  if (cell === '✓') return 'var(--oo-ok)';
  if (cell === '—') return 'var(--oo-muted)';
  return featured ? 'var(--oo-ink)' : 'var(--oo-muted)';
}

export function LandingPricing({
  plans,
  compareRows,
  unavailable,
}: {
  plans: DisplayPlan[];
  compareRows: PlanCompareRow[];
  unavailable: boolean;
}) {
  const { strings: t } = useLandingLang();
  return (
    <section id="pricing" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 96px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 14, color: 'var(--oo-accent)', fontWeight: 600 }}>{t.pricingKicker}</div>
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
        {t.pricingH2}
      </h2>
      <p style={{ margin: '0 0 48px', color: 'var(--oo-muted)', fontSize: 18 }}>{t.pricingSub}</p>
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
          {unavailable ? t.pricingUnavailable : t.pricingEmpty}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {plans.map((p) => {
              const hot = p.featured;
              const per = p.custom || p.priceCents === 0 ? '' : t.pricingPer;
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

          {compareRows.length > 0 ? (
            <div
              style={{
                marginTop: 48,
                borderRadius: 20,
                border: '1px solid var(--oo-line)',
                background: 'var(--oo-surface)',
                padding: 28,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t.compareH}</h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--oo-muted)', lineHeight: 1.6 }}>{t.compareSub}</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--oo-line)', fontWeight: 700 }}>
                      <th style={{ padding: '10px 16px 10px 0' }}>{t.compareFeature}</th>
                      {plans.map((plan) => (
                        <th key={plan.slug} style={{ padding: 10, textAlign: 'center' }}>
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.label} style={{ borderBottom: '1px solid var(--oo-line)' }}>
                        <td style={{ padding: '10px 16px 10px 0', fontWeight: 500 }}>{row.label}</td>
                        {row.cells.map((cell, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: 10,
                              textAlign: 'center',
                              color: compareCellColor(cell, plans[ci]?.featured === true),
                              fontWeight: cell === '✓' ? 700 : 400,
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function LandingCta() {
  const { strings: t } = useLandingLang();
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
          {t.ctaH}
        </h2>
        <p style={{ position: 'relative', margin: '0 auto 28px', maxWidth: 520, color: 'var(--oo-muted)' }}>{t.ctaSub}</p>
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
          {t.ctaBtn}
        </a>
      </div>
    </section>
  );
}
