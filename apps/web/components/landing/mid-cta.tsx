'use client';

import { ArrowRight } from 'lucide-react';
import { useLandingLang } from './theme';

/**
 * Slim mid-page conversion band. The hero CTAs and the bottom CTA sit a long
 * scroll apart (dashboard, trust, video, workflow, pricing); this catches the
 * visitor halfway, right after the video makes the case.
 */
export function LandingMidCta() {
  const { strings: t } = useLandingLang();
  return (
    <section
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '8px 32px 0',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '28px 32px',
          borderRadius: 20,
          border: '1px solid var(--oo-line)',
          background: 'var(--oo-surface)',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(1.5rem, 3.5vw, 2rem)',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              fontWeight: 700,
            }}
          >
            {t.midCtaH}
          </h2>
          <p style={{ margin: '8px 0 0', color: 'var(--oo-muted)', fontSize: 15 }}>{t.midCtaSub}</p>
        </div>
        <a
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 50,
            padding: '0 26px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {t.midCtaBtn}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
