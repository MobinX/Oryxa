import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePrefersReducedMotion } from './theme';

export type DemoView = 'inbox' | 'orders' | 'stats';

export const FEED: Array<[number, string, string]> = [
  [1, 'Replied to Ayesha · Messenger', '1s'],
  [2, 'Nabila sent a photo · Instagram', 'now'],
  [4, 'Tania asked about size · WhatsApp', 'now'],
  [6, 'Catalog checked · M in stock', '1.4s'],
  [7, 'Photo matched to K-204', '1.1s'],
  [9, 'Order #1042 captured', '2s'],
  [10, 'Receipt sent to Ayesha', '1s'],
];

export const ORDER_ROWS: Array<[string, string, string, string, string, string]> = [
  ['#1042', 'Ayesha R.', 'Blue kurti · M', '৳1,850', 'Confirmed', 'ok'],
  ['#1041', 'Nabila K.', 'Rose kurti · S', '৳1,650', 'Packing', 'wait'],
  ['#1040', 'Tania S.', 'Panjabi · L', '৳1,390', 'Delivered', 'ok'],
  ['#1039', 'Imran H.', 'Three-piece set', '৳3,200', 'Packing', 'wait'],
];

export const BARS2: Array<[string, number]> = [
  ['Mon', 50],
  ['Tue', 64],
  ['Wed', 58],
  ['Thu', 82],
  ['Fri', 70],
  ['Sat', 104],
  ['Sun', 92],
];

export interface DemoTimeline {
  tick: number;
  t: number;
  s1: boolean;
  typing1: boolean;
  s3: boolean;
  s4: boolean;
  typing2: boolean;
  s6: boolean;
  s7: boolean;
  s8: boolean;
  orderDone: boolean;
  preview: string;
  nPrev: string;
  tPrev: string;
  orders: string;
  revenue: string;
  toast: boolean;
  feed: Array<[number, string, string]>;
  bars: number[];
}

/**
 * 20-beat loop driving the landing dashboard demo (desktop + phone share it).
 * The story builds on beats 1–9, then HOLDS the completed state through beat
 * 19 so panels never sit empty; only beat 0 restarts. Frozen while paused or
 * when the OS asks for reduced motion.
 */
export function useLandingDemoTimeline(paused: boolean): DemoTimeline {
  const [tick, setTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => setTick((value) => value + 1), 1300);
    return () => clearInterval(id);
  }, [reducedMotion, paused]);

  const t = (Math.max(tick, 2) - 2) % 20;
  const s1 = t >= 1;
  const typing1 = t === 2;
  const s3 = t >= 3;
  const s4 = t >= 4;
  const typing2 = t === 5;
  const s6 = t >= 6;
  const s7 = t >= 8;
  const s8 = t >= 9;
  const orderDone = t >= 9;

  const preview = orderDone
    ? 'Order #1042 confirmed ✓'
    : t >= 4
      ? 'Is the blue kurti available in M?'
      : 'Assalamualaikum';
  const nPrev = t >= 6 ? 'Photo matched · K-204 ✓' : 'Sent a photo';
  const tPrev = t >= 7 ? 'Size M in stock ✓' : 'M size ache?';
  const orders = orderDone ? '13' : '12';
  const revenue = orderDone ? '৳26,580' : '৳24,650';
  const toast = t >= 9 && t <= 13;
  const bars = [40, 56, 48, 70, 62, 80, orderDone ? 100 : 84];
  // On the restart beat the feed keeps showing the full story, never blanks.
  const feed = (t < 1 ? FEED : FEED.filter((x) => t >= x[0])).slice(-4).reverse();

  return {
    tick,
    t,
    s1,
    typing1,
    s3,
    s4,
    typing2,
    s6,
    s7,
    s8,
    orderDone,
    preview,
    nPrev,
    tPrev,
    orders,
    revenue,
    toast,
    feed,
    bars,
  };
}

/** SSR-safe media query: false on the server and first paint, live after mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Visibility gate for the animated demos: timers run only while the wrapped
 * element is near the viewport, so a single demo animates at a time and an
 * off-screen one costs nothing. True until measured (SSR, old browsers).
 */
export function useInView<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}
