'use client';

import { useState } from 'react';
import { Tag, Briefcase, Zap, Crown, Building2, Sparkles } from 'lucide-react';
import type { DisplayPlan, PlanCompareRow } from '@/lib/plan-display';
import { CompareTable } from './compare';
import { useLandingLang } from './theme';

function PlanIcon({ slug }: { slug: string }) {
  const props = { size: 20, strokeWidth: 2 };
  switch (slug.toLowerCase()) {
    case 'free':
      return <Briefcase {...props} />;
    case 'starter':
      return <Zap {...props} />;
    case 'pro':
      return <Crown {...props} />;
    case 'enterprise':
      return <Building2 {...props} />;
    default:
      return <Sparkles {...props} />;
  }
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
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  return (
    <section id="pricing" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 96px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--oo-halo)',
            color: 'var(--oo-accent)',
          }}
        >
          <Tag size={14} />
          {t.pricingBadge}
        </span>
      </div>
      <h2
        style={{
          margin: '0 auto 14px',
          maxWidth: 640,
          textAlign: 'center',
          fontSize: 48,
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 700,
        }}
      >
        {t.pricingH2}
      </h2>
      <p
        style={{
          margin: '0 auto 24px',
          maxWidth: 560,
          textAlign: 'center',
          color: 'var(--oo-muted)',
          fontSize: 18,
        }}
      >
        {t.pricingSub}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
        <div
          role="group"
          aria-label={t.billingGroup}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            border: '1px solid var(--oo-line)',
            borderRadius: 999,
            padding: 4,
            background: 'var(--oo-surface)',
          }}
        >
          <button
            type="button"
            aria-pressed={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
            style={{
              minHeight: 40,
              padding: '0 22px',
              borderRadius: 999,
              border: 0,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              background:
                billing === 'monthly'
                  ? 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))'
                  : 'transparent',
              color: billing === 'monthly' ? '#fff' : 'var(--oo-muted)',
            }}
          >
            {t.billingMonthly}
          </button>
          <button
            type="button"
            aria-pressed={billing === 'yearly'}
            onClick={() => setBilling('yearly')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 40,
              padding: '0 22px',
              borderRadius: 999,
              border: 0,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              background:
                billing === 'yearly'
                  ? 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))'
                  : 'transparent',
              color: billing === 'yearly' ? '#fff' : 'var(--oo-muted)',
            }}
          >
            {t.billingYearly}
            <span
              style={{
                background: 'var(--oo-halo)',
                color: 'var(--oo-accent)',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                padding: '2px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.billingSave}
            </span>
          </button>
        </div>
      </div>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              paddingTop: 16,
            }}
          >
            {plans.map((p) => {
              const hot = p.featured;
              let price: string;
              let per: string;
              if (p.custom) {
                price = p.priceLabel;
                per = '';
              } else if (billing === 'monthly') {
                price = p.priceLabel;
                per = p.priceCents > 0 ? t.pricingPer : '';
              } else if (p.priceCents === 0) {
                price = '$0';
                per = '';
              } else {
                price = '$' + Math.round((p.priceCents * 12 * 0.9) / 100);
                per = t.pricingPerYear;
              }
              const bullets = p.features.slice(0, 3);
              const isTrial = p.priceCents === 0 && !p.custom;
              return (
                <div
                  key={p.slug}
                  className={hot ? 'oo-plan-card oo-plan-featured' : 'oo-plan-card'}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                    padding: 28,
                    borderRadius: 20,
                    border: hot ? '2px solid var(--oo-accent)' : '1px solid var(--oo-line)',
                    background: 'var(--oo-surface)',
                    minHeight: hot ? 420 : 380,
                    boxShadow: hot ? '0 32px 72px var(--oo-halo)' : 'none',
                  }}
                >
                  {hot && p.badge ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '5px 16px',
                        borderRadius: 999,
                        background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
                        color: '#fff',
                        boxShadow: '0 8px 20px var(--oo-halo)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.badge === 'Most popular' ? <Crown size={12} strokeWidth={2} /> : null}
                      {p.badge}
                    </span>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: 'var(--oo-halo)',
                        color: 'var(--oo-accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <PlanIcon slug={p.slug} />
                    </span>
                  </div>
                  {!hot && p.badge ? (
                    <span
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: -8,
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
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>{price}</span>
                      {per ? <span style={{ color: 'var(--oo-muted)', fontSize: 15 }}>{per}</span> : null}
                    </div>
                    {isTrial ? (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 10,
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '3px 12px',
                          borderRadius: 999,
                          border: '1px solid var(--oo-accent)',
                          color: 'var(--oo-accent)',
                          background: 'transparent',
                        }}
                      >
                        {t.trialBadge}
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      fontSize: 14,
                      flexGrow: 1,
                      color: 'var(--oo-muted)',
                    }}
                  >
                    {bullets.map((b) => (
                      <span key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            background: 'var(--oo-halo)',
                            color: 'var(--oo-ok)',
                          }}
                        >
                          ✓
                        </span>
                        <span>{b}</span>
                      </span>
                    ))}
                    {isTrial ? <span style={{ fontSize: 12, color: 'var(--oo-muted)' }}>{t.trialNote}</span> : null}
                  </div>
                  <a
                    href={p.ctaHref}
                    className={hot ? 'oo-plan-cta oo-plan-cta-hot' : 'oo-plan-cta'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      minHeight: 48,
                      borderRadius: 12,
                      fontWeight: 600,
                      fontSize: 14,
                      ...(hot
                        ? {
                            background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
                            color: '#fff',
                            border: '1.5px solid transparent',
                          }
                        : {}),
                    }}
                  >
                    {p.cta}
                  </a>
                </div>
              );
            })}
          </div>

          {compareRows.length > 0 ? (
            <CompareTable plans={plans} compareRows={compareRows} />
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
