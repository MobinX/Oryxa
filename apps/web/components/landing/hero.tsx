'use client';

import { useLandingLang } from './theme';

export function LandingHero({ companyName }: { companyName: string }) {
  const { strings: t } = useLandingLang();
  return (
    <section id="top" style={{ position: 'relative', textAlign: 'center', padding: '72px 32px 0', boxSizing: 'border-box' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: 1100,
          height: 640,
          marginLeft: -550,
          background: 'radial-gradient(closest-side, var(--oo-halo), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto' }}>
        <div
          className="up"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid var(--oo-line)',
            background: 'var(--oo-surface)',
            fontSize: 13,
            color: 'var(--oo-muted)',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--oo-ok)' }} />
          {t.heroBadge}
        </div>
        <h1
          className="up u2"
          style={{ margin: '26px 0 20px', fontSize: 76, lineHeight: 1.02, letterSpacing: '-0.045em', fontWeight: 700 }}
        >
          {t.heroH1a}
          <br />
          <span
            style={{
              background: 'linear-gradient(100deg,var(--oo-accent),var(--oo-accent2))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {t.heroH1b}
          </span>
        </h1>
        <p className="up u3" style={{ margin: '0 auto 32px', maxWidth: 600, fontSize: 19, color: 'var(--oo-muted)' }}>
          {t.heroSub(companyName)}
        </p>
        <div className="up u3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <a
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 50,
              padding: '0 26px',
              borderRadius: 12,
              background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
              color: '#fff',
              fontWeight: 600,
              boxShadow: '0 10px 30px var(--oo-halo)',
            }}
          >
            {t.heroCta}
          </a>
          <a
            href="#video"
            className="hov"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 50,
              padding: '0 26px',
              borderRadius: 12,
              border: '1px solid var(--oo-line)',
              background: 'var(--oo-surface)',
              color: 'var(--oo-ink)',
              fontWeight: 500,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5l12 7-12 7z"></path>
            </svg>
            {t.heroVideo}
          </a>
        </div>
        <p className="up u3" style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--oo-muted)' }}>
          {t.heroMicro}
        </p>
      </div>
    </section>
  );
}

export function LandingTrustStrip() {
  const { strings: t } = useLandingLang();
  return (
    <section
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '48px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '12px 44px',
        color: 'var(--oo-muted)',
        fontSize: 14,
        borderBottom: '1px solid var(--oo-line)',
      }}
    >
      {t.trust.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </section>
  );
}
