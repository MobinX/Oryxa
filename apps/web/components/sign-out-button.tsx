'use client';

import { useTransition } from 'react';
import { signOutAction } from '@/app/actions/auth';

export function SignOutForm({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
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
      title={title}
    >
      {children}
    </button>
  );
}
