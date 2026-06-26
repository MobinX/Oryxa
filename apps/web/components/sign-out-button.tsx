'use client';

import { useTransition } from 'react';
import { signOutAction } from '@/app/actions/auth';

export function SignOutForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await signOutAction();
        });
      }}
      className={className}
    >
      {children}
    </button>
  );
}
