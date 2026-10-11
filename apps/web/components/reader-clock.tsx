'use client';

import { useEffect, useState } from 'react';

/**
 * A timestamp rendered on the server comes out on the server's clock — UTC, whatever
 * locale the runtime defaults to — while the reader's first client render formats the
 * same instant on their own, and every differing character is a hydration failure that
 * discards the tree. These draw after hydration, so the reader's clock wins outright.
 */
export function ReaderTime({ at }: { at: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(new Date(at).toLocaleTimeString());
  }, [at]);

  return <>{text}</>;
}

export function ReaderDate({ at }: { at: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }, [at]);

  return <>{text}</>;
}
