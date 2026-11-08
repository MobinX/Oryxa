'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLandingLang, useLandingTheme } from './theme';

/**
 * Host-aware brand mark: transparent cart lockup mark for all brands.
 * /onlyorders-mark.png is the designated transparent asset (no black box),
 * so the header/footer never show a solid background in light or dark mode.
 */
export function BrandMark({ companyName }: { companyName: string }) {
  if (companyName === 'OnlyOrders') {
    return <Image src="/onlyorders-mark.png" alt="" width={40} height={30} style={{ width: 'auto', height: 30 }} draggable={false} />;
  }
  return <Image src="/onlyorders-mark.png" alt="" width={30} height={30} style={{ width: 30, height: 30 }} draggable={false} />;
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
    </svg>
  );
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minWidth: 44,
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid var(--oo-line)',
  background: 'var(--oo-surface)',
  color: 'var(--oo-ink)',
  fontSize: 13,
  fontWeight: 600,
};

export function LandingHeader({ companyName }: { companyName: string }) {
  const { dark, toggle } = useLandingTheme();
  const { lang, strings: t, toggleLang } = useLandingLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: dark ? 'rgba(28,30,48,0.82)' : 'rgba(238,240,248,0.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--oo-line)',
      }}
    >
      <div
        className="oo-header-inner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          maxWidth: 1240,
          margin: '0 auto',
          padding: '12px 32px',
          boxSizing: 'border-box',
        }}
      >
        <a
          href="#top"
          className="oo-header-brand"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--oo-ink)',
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          <BrandMark companyName={companyName} />
          <span className="oo-header-name">{companyName}</span>
        </a>
        <nav
          className="oo-nav-links"
          style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 14, whiteSpace: 'nowrap' }}
        >
          <a href="#workflow" style={{ color: 'var(--oo-muted)' }}>
            {t.navProduct}
          </a>
          <a href="#video" style={{ color: 'var(--oo-muted)' }}>
            {t.navDemo}
          </a>
          <a href="#pricing" style={{ color: 'var(--oo-muted)' }}>
            {t.navPricing}
          </a>
          <a href="/docs" style={{ color: 'var(--oo-muted)' }}>
            {t.navDocs}
          </a>
        </nav>
        <div className="oo-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={toggleLang}
            aria-label={lang === 'en' ? 'বাংলায় দেখুন' : 'View in English'}
            title={lang === 'en' ? 'বাংলা' : 'English'}
            className="hov"
            style={iconButton}
          >
            {lang === 'en' ? 'বাং' : 'EN'}
          </button>
          <button
            onClick={toggle}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={dark ? t.themeToLight : t.themeToDark}
            className="hov"
            style={iconButton}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <a
            href="/login"
            className="oo-signin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: '0 14px',
              color: 'var(--oo-muted)',
              fontSize: 14,
              whiteSpace: 'nowrap',
            }}
          >
            {t.signIn}
          </a>
          <a
            href="/login"
            className="oo-header-cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: '0 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              boxShadow: '0 8px 22px var(--oo-halo), inset 0 1px 0 rgba(255,255,255,0.25)',
              border: '1px solid transparent',
            }}
          >
            {t.getStarted}
          </a>
          <button
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? t.menuClose : t.menuOpen}
            aria-expanded={menuOpen}
            className="oo-mobile-menu-btn hov"
            style={{ ...iconButton, display: undefined }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18"></path>
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16"></path>
              )}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="oo-mobile-menu" aria-label="Mobile">
          <a href="#workflow" onClick={closeMenu} style={{ color: 'var(--oo-ink)' }}>
            {t.navProduct}
          </a>
          <a href="#video" onClick={closeMenu} style={{ color: 'var(--oo-ink)' }}>
            {t.navDemo}
          </a>
          <a href="#pricing" onClick={closeMenu} style={{ color: 'var(--oo-ink)' }}>
            {t.navPricing}
          </a>
          <a href="/docs" onClick={closeMenu} style={{ color: 'var(--oo-ink)' }}>
            {t.navDocs}
          </a>
          <a href="/login" onClick={closeMenu} style={{ color: 'var(--oo-ink)' }}>
            {t.signIn}
          </a>
        </nav>
      )}
      <style>{`@media (max-width: 860px){.oo .oo-nav-links{display:none}}@media (max-width: 520px){.oo .oo-signin{display:none}}`}</style>
    </header>
  );
}
