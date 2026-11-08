'use client';

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { detectLandingLang, LANDING_STRINGS, type LandingLang, type LandingStrings } from './i18n';

/**
 * NOTE: fonts load via plain <link> in the root layout, NOT next/font. The
 * Turbopack font pipeline (@vercel/turbopack-next font loader) fails under
 * Vercel's Bun install with 28 "can't resolve font" errors; a stylesheet
 * link sidesteps it deterministically. Keep this stack in sync with that link.
 */
const LANDING_FONT_STACK = `'Inter', 'Noto Sans Bengali', system-ui, sans-serif`;

/** Theme tokens ported 1:1 from the mockup (`L` / `D` in Main.dc.html). */
const LIGHT_VARS: CSSProperties = {
  '--oo-bg': '#F6F7FC',
  '--oo-surface': '#FFFFFF',
  '--oo-surface2': '#EEF0F8',
  '--oo-line': 'rgba(23,25,70,0.09)',
  '--oo-lineStrong': 'rgba(23,25,70,0.20)',
  '--oo-ink': '#101230',
  '--oo-muted': '#525873',
  '--oo-accent': '#5846F6',
  '--oo-accent2': '#3D8BFF',
  '--oo-halo': 'rgba(88,70,246,0.16)',
  '--oo-halo2': 'rgba(88,70,246,0.42)',
  '--oo-shadow': 'rgba(35,35,95,0.14)',
  '--oo-ok': '#14805A',
  '--oo-okBg': 'rgba(20,128,90,0.12)',
  '--oo-wait': '#9A5B00',
  '--oo-waitBg': 'rgba(245,158,11,0.18)',
} as CSSProperties;

const DARK_VARS: CSSProperties = {
  '--oo-bg': '#12142A',
  '--oo-surface': '#1D2038',
  '--oo-surface2': '#262A45',
  '--oo-line': 'rgba(255,255,255,0.10)',
  '--oo-lineStrong': 'rgba(255,255,255,0.22)',
  '--oo-ink': '#F1F2FB',
  '--oo-muted': '#A7AAC6',
  '--oo-accent': '#8A7DFF',
  '--oo-accent2': '#4C9BFF',
  '--oo-halo': 'rgba(120,105,255,0.26)',
  '--oo-halo2': 'rgba(138,125,255,0.5)',
  '--oo-shadow': 'rgba(0,0,0,0.45)',
  '--oo-ok': '#4ADE9B',
  '--oo-okBg': 'rgba(74,222,155,0.14)',
  '--oo-wait': '#FFC857',
  '--oo-waitBg': 'rgba(255,200,87,0.16)',
} as CSSProperties;

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export function useLandingTheme() {
  return useContext(ThemeContext);
}

const LangContext = createContext<{ lang: LandingLang; strings: LandingStrings; toggleLang: () => void }>({
  lang: 'en',
  strings: LANDING_STRINGS.en,
  toggleLang: () => {},
});

export function useLandingLang() {
  return useContext(LangContext);
}

/** True when the OS asks for reduced motion; auto-play timers freeze then. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Cookie read on the client; the server passes its own read as initialLang. */
function cookieLang(): LandingLang | null {
  try {
    const hit = document.cookie.split('; ').find((part) => part.startsWith('oo-lang='));
    const value = hit?.split('=')[1];
    return value === 'bn' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function LandingRoot({ children, initialLang = 'en' }: { children: ReactNode; initialLang?: LandingLang }) {
  // The mockup starts in light mode (startDark defaults to false).
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState<LandingLang>(initialLang);
  // First paint already matches the server read (cookie); after mount prefer
  // the cookie again, then localStorage / locale detection. No flash either way.
  useEffect(() => {
    setLang(cookieLang() ?? detectLandingLang());
  }, []);
  const toggle = () => setDark((value) => !value);
  const toggleLang = () =>
    setLang((value) => {
      const next = value === 'en' ? 'bn' : 'en';
      try {
        window.localStorage.setItem('oo-lang', next);
        // The server reads this cookie so the first paint already matches.
        document.cookie = `oo-lang=${next}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        /* private mode — keep it in memory only */
      }
      return next;
    });
  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <LangContext.Provider value={{ lang, strings: LANDING_STRINGS[lang], toggleLang }}>
        <div
          className="oo"
          style={{
            ...(dark ? DARK_VARS : LIGHT_VARS),
            background: 'var(--oo-bg)',
            color: 'var(--oo-ink)',
            fontFamily: LANDING_FONT_STACK,
            fontSize: 16,
            lineHeight: 1.55,
            letterSpacing: '-0.01em',
            boxSizing: 'border-box',
            minHeight: '100%',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            aria-hidden="true"
            className="oo-canvas"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          />
          <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
        </div>
      </LangContext.Provider>
    </ThemeContext.Provider>
  );
}
