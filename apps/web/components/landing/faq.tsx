'use client';

import { useLandingLang } from './theme';

/**
 * Pricing-objection FAQ above the footer. Native <details> rows: zero JS
 * state, keyboard- and screen-reader-friendly out of the box.
 */
export function LandingFaq() {
  const { strings: t } = useLandingLang();
  return (
    <section
      id="faq"
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '0 32px 96px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '6px 16px',
          borderRadius: 999,
          background: 'var(--oo-halo)',
          color: 'var(--oo-accent)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {t.faqKicker}
      </div>
      <h2
        style={{
          margin: '10px 0 12px',
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 700,
        }}
      >
        {t.faqH2}
      </h2>
      <p style={{ margin: '0 0 28px', color: 'var(--oo-muted)', fontSize: 18 }}>{t.faqSub}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {t.faqItems.map((item) => (
          <details
            key={item.q}
            style={{
              borderRadius: 16,
              border: '1px solid var(--oo-line)',
              background: 'var(--oo-surface)',
              padding: '18px 22px',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--oo-ink)',
                listStylePosition: 'outside',
              }}
            >
              {item.q}
            </summary>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: 'var(--oo-muted)' }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
