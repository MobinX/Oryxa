import { Suspense } from 'react';
import { CircleDollarSign, Receipt } from 'lucide-react';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminRead } from '@/lib/admin-read';
import { getAdminModelBilling, type ModelBilling } from '@/lib/api';
import { saveModelBillingAction } from '@/app/actions/model-billing';
import { AdminPageHeader } from '@/components/admin-page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: 'Model billing — admin',
    description: `The token rates ${companyName} uses to price every agent run.`,
  };
}

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ModelBillingPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-muted" />}>
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BillingContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const bearer = await requireConsoleBearer();
  const params = await searchParams;
  const read = await adminRead(() => getAdminModelBilling(bearer));
  const rate = read.value;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Receipt}
        title="Model billing"
        description="The per-million token rates used to price token analytics. Saving reprices every month already on the Tokens page, not only new runs."
      />

      {one(params.saved) === '1' && (
        <Card className="border-primary/30 p-4 text-sm">
          Rates saved. Token analytics has been repriced.
        </Card>
      )}
      {one(params.error) && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {one(params.error) === 'invalid'
            ? 'Enter a provider, a model, and three rates that are zero or greater.'
            : decodeURIComponent(one(params.error) ?? 'The rates could not be saved.')}
        </Card>
      )}

      {rate ? (
        <RateForm rate={rate} />
      ) : (
        <Card className="border-destructive/40 p-5 text-sm text-destructive">
          {read.error ?? 'The rate card could not be read.'}
        </Card>
      )}
    </div>
  );
}

function RateForm({ rate }: { rate: ModelBilling }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            Token rates
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All rates are US dollars per 1,000,000 tokens. Cached input is the price for
            prompt-cache reads; the remaining input is billed at the normal input rate.
          </p>
        </div>
        <span className="rounded-full border border-border/50 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
          updated {new Date(rate.updatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
        </span>
      </div>

      <form action={saveModelBillingAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Provider</span>
          <Input
            name="provider"
            required
            maxLength={50}
            defaultValue={rate.provider}
            placeholder="openai"
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Model</span>
          <Input
            name="model"
            required
            maxLength={100}
            defaultValue={rate.model}
            placeholder="gpt-6-luna"
            className="mt-1"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Input $ / 1M tokens</span>
          <Input
            name="inputUsdPerMillion"
            type="number"
            required
            min={0}
            step="0.000001"
            defaultValue={String(rate.inputUsdPerMillion)}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Output $ / 1M tokens</span>
          <Input
            name="outputUsdPerMillion"
            type="number"
            required
            min={0}
            step="0.000001"
            defaultValue={String(rate.outputUsdPerMillion)}
            className="mt-1"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Cached input $ / 1M tokens</span>
          <Input
            name="cachedInputUsdPerMillion"
            type="number"
            required
            min={0}
            step="0.000001"
            defaultValue={String(rate.cachedInputUsdPerMillion)}
            className="mt-1"
          />
        </label>

        <div className="flex justify-end border-t border-border pt-4 sm:col-span-2">
          <Button type="submit">Save rates</Button>
        </div>
      </form>
    </Card>
  );
}
