'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type UploadGate = {
  /** True while any image inside this form is still on its way to storage. */
  uploading: boolean;
  begin: () => void;
  end: () => void;
};

const UploadGateContext = createContext<UploadGate | null>(null);

/**
 * How a product form's save button knows an image is still in flight: the upload happens in a
 * variant row and the button sits at the bottom of the page, so the count lives between them.
 * Saving while an upload is running would write the product without the picture nobody has
 * finished sending, and the row would keep spinning afterwards with nothing left to save.
 */
export function UploadGate({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(0);
  const begin = useCallback(() => setRunning((count) => count + 1), []);
  const end = useCallback(() => setRunning((count) => Math.max(0, count - 1)), []);

  return (
    <UploadGateContext.Provider value={{ uploading: running > 0, begin, end }}>
      {children}
    </UploadGateContext.Provider>
  );
}

/** Null when the form was not wrapped, which leaves the uploader working as it did before. */
export function useUploadGate(): UploadGate | null {
  return useContext(UploadGateContext);
}
