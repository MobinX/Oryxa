'use client';

import { Inter } from 'next/font/google';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

/** Theme tokens ported 1:1 from the mockup (`L` / `D` in Main.dc.html). */
const LIGHT_VARS: CSSProperties = {
  '--oo-bg': '#EEF0F8',
  '--oo-surface': '#FFFFFF',
  '--oo-surface2': '#F3F4FA',
  '--oo-line': 'rgba(30,30,70,0.10)',
  '--oo-lineStrong': 'rgba(30,30,70,0.22)',
  '--oo-ink': '#14152A',
  '--oo-muted': '#575A74',
  '--oo-accent': '#5B4BEA',
  '--oo-accent2': '#3F8CFF',
  '--oo-halo': 'rgba(91,75,234,0.18)',
  '--oo-halo2': 'rgba(91,75,234,0.45)',
  '--oo-shadow': 'rgba(40,40,100,0.16)',
  '--oo-ok': '#14805A',
  '--oo-okBg': 'rgba(20,128,90,0.12)',
  '--oo-wait': '#9A5B00',
  '--oo-waitBg': 'rgba(245,158,11,0.18)',
} as CSSProperties;

const DARK_VARS: CSSProperties = {
  '--oo-bg': '#1C1E30',
  '--oo-surface': '#262941',
  '--oo-surface2': '#2F3350',
  '--oo-line': 'rgba(255,255,255,0.10)',
  '--oo-lineStrong': 'rgba(255,255,255,0.24)',
  '--oo-ink': '#EFF0FA',
  '--oo-muted': '#AEB1CB',
  '--oo-accent': '#8A7DFF',
  '--oo-accent2': '#4C9BFF',
  '--oo-halo': 'rgba(120,105,255,0.24)',
  '--oo-halo2': 'rgba(138,125,255,0.5)',
  '--oo-shadow': 'rgba(0,0,0,0.40)',
  '--oo-ok': '#4ADE9B',
  '--oo-okBg': 'rgba(74,222,155,0.14)',
  '--oo-wait': '#FFC857',
  '--oo-waitBg': 'rgba(255,200,87,0.16)',
} as CSSProperties;

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export function useLandingTheme() {
  return useContext(ThemeContext);
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

export function LandingRoot({ children }: { children: ReactNode }) {
  // The mockup starts in light mode (startDark defaults to false).
  const [dark, setDark] = useState(false);
  const toggle = () => setDark((value) => !value);
  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <div
        className={`oo ${inter.className}`}
        style={{
          ...(dark ? DARK_VARS : LIGHT_VARS),
          background: 'var(--oo-bg)',
          color: 'var(--oo-ink)',
          fontSize: 16,
          lineHeight: 1.55,
          letterSpacing: '-0.01em',
          boxSizing: 'border-box',
          minHeight: '100%',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
