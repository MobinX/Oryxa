'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type UploadGate = {
  /** True while any picture inside this form is still being handled. */
  uploading: boolean;
  /** How far the running upload has got, or null while only reading/editing is going on. */
  percent: number | null;
  begin: () => void;
  end: () => void;
  report: (percent: number) => void;
};

const UploadGateContext = createContext<UploadGate | null>(null);

/**
 * How a product form's save button knows a picture is still being handled: the upload happens in a
 * variant row and the button sits at the bottom of the page, so the state lives between them.
 * Saving while an image is in flight would write the product without the picture nobody has
 * finished sending, and the row would keep spinning afterwards with a form already persisted.
 *
 * It counts rather than flags because several variants can be working at once — the button
 * unlocks when the last one settles, not the first. One state object holds both halves for the
 * same reason: a first finisher must not blank the percentage a later one is still moving.
 */
export function UploadGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ running: number; percent: number | null }>({
    running: 0,
    percent: null,
  });

  const begin = useCallback(() => setState((s) => ({ ...s, running: s.running + 1 })), []);
  const end = useCallback(
    () =>
      setState((s) => {
        const running = Math.max(0, s.running - 1);
        return { running, percent: running === 0 ? null : s.percent };
      }),
    [],
  );
  const report = useCallback(
    (percent: number) => setState((s) => (s.running > 0 ? { ...s, percent } : s)),
    [],
  );

  return (
    <UploadGateContext.Provider
      value={{ uploading: state.running > 0, percent: state.percent, begin, end, report }}
    >
      {children}
    </UploadGateContext.Provider>
  );
}

/** Null when the form was not wrapped, which leaves the uploader working as it did before. */
export function useUploadGate(): UploadGate | null {
  return useContext(UploadGateContext);
}
