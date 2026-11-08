'use client';

import { Check, Headphones, MessageCircle, Package, ShoppingCart } from 'lucide-react';
import { useLandingLang } from './theme';

function ChannelGlyph({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'var(--oo-halo)',
      }}
    >
      {children}
    </span>
  );
}

function MessengerGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <ellipse cx="9" cy="8" rx="6.5" ry="5.5" stroke="var(--oo-accent)" strokeWidth="1.6" />
      <path d="M6.5 12.2 5.5 15l3-1.6" stroke="var(--oo-accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.8 5.2 7.4 8.4h2.4l-.9 2.6 3-3.6H9.4l1-2.2z" fill="var(--oo-accent)" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="12" height="12" rx="3.5" stroke="var(--oo-accent)" strokeWidth="1.6" />
      <circle cx="9" cy="9" r="2.8" stroke="var(--oo-accent)" strokeWidth="1.6" />
      <circle cx="12.8" cy="6.2" r="1" fill="var(--oo-accent)" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.5c3.6 0 6.5 2.7 6.5 6 0 3.3-2.9 6-6.5 6-.8 0-1.6-.1-2.3-.4L3.5 15.5l1-2.9c-1-1-1.5-2.2-1.5-3.6 0-3.3 2.9-6.5 6-6.5z"
        stroke="var(--oo-accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 7.2c.3-.6 1-.8 1.3-.2l.5.9c.2.3.1.7-.2.9l-.4.3c.3.7.9 1.3 1.6 1.6l.3-.4c.2-.3.6-.4.9-.2l.9.5c.6.3.4 1-.2 1.3-2.4 1-5.9-2.5-4.9-4.9l.2.2z"
        fill="var(--oo-accent)"
      />
    </svg>
  );
}

export function LandingHero({ companyName }: { companyName: string }) {
  const { strings: t } = useLandingLang();
  return (
    <section id="top" className="oo-hero" style={{ position: 'relative', textAlign: 'center', padding: '72px 32px 0', boxSizing: 'border-box' }}>
      <div
        className="oo-hero-glow"
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
          className="up oo-hero-badge"
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
        <div className="up u3 oo-hero-ctas" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
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
        <div
          className="up u3"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            justifyContent: 'center',
            marginTop: 10,
          }}
        >
          {t.heroPoints.map((point) => (
            <span key={point} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--oo-muted)' }}>
              <Check size={14} color="var(--oo-accent)" aria-hidden="true" />
              {point}
            </span>
          ))}
        </div>
        <div
          className="up u3"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            marginTop: 14,
          }}
        >
          <ChannelGlyph label="Messenger">
            <MessengerGlyph />
          </ChannelGlyph>
          <ChannelGlyph label="Instagram">
            <InstagramGlyph />
          </ChannelGlyph>
          <ChannelGlyph label="WhatsApp">
            <WhatsAppGlyph />
          </ChannelGlyph>
        </div>
      </div>
    </section>
  );
}

const TRUST_ICONS = [MessageCircle, Package, ShoppingCart, Headphones] as const;

export function LandingTrustStrip() {
  const { strings: t } = useLandingLang();
  return (
    <section
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '48px 32px',
        boxSizing: 'border-box',
        borderBottom: '1px solid var(--oo-line)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {t.trustCards.map((card, i) => {
          const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
          return (
            <div
              key={card.title}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '16px 18px',
                borderRadius: 16,
                border: '1px solid var(--oo-line)',
                background: 'var(--oo-surface)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 12,
                  background: 'var(--oo-halo)',
                }}
              >
                <Icon size={20} color="var(--oo-accent)" aria-hidden="true" />
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--oo-ink)' }}>{card.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--oo-muted)' }}>{card.sub}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
