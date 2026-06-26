'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function PageError({
  title = 'Something went wrong',
  message,
  reset,
}: {
  title?: string;
  message?: string;
  reset?: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <h2 className="text-lg font-semibold text-[var(--destructive)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {message ?? 'We could not load this page. Please try again.'}
        </p>
        {reset && (
          <Button className="mt-6" onClick={reset}>
            Try again
          </Button>
        )}
      </Card>
    </div>
  );
}
