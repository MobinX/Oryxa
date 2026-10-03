'use client';

import { useTransition } from 'react';
import { signOutAction } from '@/app/actions/auth';

export function SignOutForm({
  className,
  children,
  title,
  action = signOutAction,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  /** Which session to end — the console's own is separate from the app's. */
  action?: () => void | Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await action();
        });
      }}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}
