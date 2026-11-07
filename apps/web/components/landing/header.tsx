'use client';

import { useLandingTheme } from './theme';

export function LandingHeader({ companyName }: { companyName: string }) {
  const { dark, toggle } = useLandingTheme();
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        maxWidth: 1200,
        margin: '0 auto',
        padding: '18px 32px',
        boxSizing: 'border-box',
      }}
    >
      <a
        href="#top"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'var(--oo-ink)',
          fontWeight: 700,
          fontSize: 18,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          O
        </span>
        {companyName}
      </a>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 28, fontSize: 14 }}>
        <a href="#workflow" style={{ color: 'var(--oo-muted)' }}>
          Product
        </a>
        <a href="#workflow" style={{ color: 'var(--oo-muted)' }}>
          Features
        </a>
        <a href="#pricing" style={{ color: 'var(--oo-muted)' }}>
          Pricing
        </a>
        <a href="/docs" style={{ color: 'var(--oo-muted)' }}>
          Docs
        </a>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={toggle}
          aria-label="Switch between light and dark theme"
          className="hov"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 10,
            border: '1px solid var(--oo-line)',
            background: 'var(--oo-surface)',
            color: 'var(--oo-ink)',
            fontSize: 14,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
          </svg>
          {dark ? 'Light' : 'Dark'}
        </button>
        <a
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 14px',
            color: 'var(--oo-muted)',
            fontSize: 14,
          }}
        >
          Sign in
        </a>
        <a
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 10,
            background: 'var(--oo-ink)',
            color: 'var(--oo-bg)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Get started
        </a>
      </div>
    </header>
  );
}
