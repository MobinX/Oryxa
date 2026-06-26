'use client';

import { useEffect } from 'react';

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isMobileDevice() {
  if (typeof window === 'undefined') return false;

  return (
    MOBILE_UA.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches
  );
}

export function Eruda() {
  useEffect(() => {
    if (!isMobileDevice()) return;

    import('eruda').then(({ default: eruda }) => {
      eruda.init();
      eruda.position({ x: window.innerWidth - 50, y: 0 });
    });
  }, []);

  return null;
}
