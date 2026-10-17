'use client';

import { useState, useTransition } from 'react';
import { Building2, RefreshCw, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { swapBrandAction } from '@/app/actions/brand';
import { COMPANY_NAME, OTHER_COMPANY_NAME } from '@/lib/brand';

/**
 * The button that renames the product.
 *
 * Its label is the name the swap would move *to*, read from this build's `COMPANY_NAME`: while the
 * site is Oryxa it offers OnlyOrders, and once the OnlyOrders build goes live the same button offers
 * Oryxa back. That is the only honest label available, because a click starts a build rather than
 * editing a row — the name a visitor reads changes some minutes after the press, so the button has to
 * say where it is going, not claim it already arrived.
 *
 * Clicking it twice is the undo.
 */
export function BrandSwapButton() {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  function swap() {
    startTransition(async () => {
      const result = await swapBrandAction();
      setNotice(
        result.ok
          ? {
              tone: 'ok',
              text: `Wrote ${result.result.to.COMPANY_NAME} and started production builds for ${result.result.builds
                .map((build) => `${build.project} (${build.deploymentId})`)
                .join(' and ')}. Every page keeps printing ${COMPANY_NAME} until those builds are promoted.`,
            }
          : { tone: 'bad', text: result.error },
      );
    });
  }

  return (
    <Card className="hover:shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Brand
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-bold">
            <span>{COMPANY_NAME}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{OTHER_COMPANY_NAME}</span>
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Writes the name, the legal entity behind it and the storefront address on Vercel, then
            redeploys the web app and the API that links to it — all of it is baked into a build.
            Pressing it again brings the current name back.
          </p>
        </div>

        <Button type="button" onClick={swap} disabled={isPending} variant="outline" size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Change Name to {OTHER_COMPANY_NAME}
        </Button>
      </div>

      {notice ? (
        <p
          className={`mt-4 text-sm ${
            notice.tone === 'ok'
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-destructive'
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </Card>
  );
}
