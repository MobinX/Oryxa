import { Suspense } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Gauge,
  Receipt,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminRead } from '@/lib/admin-read';
import { getAdminModelBilling, type ModelBilling } from '@/lib/api';
import { saveModelBillingAction } from '@/app/actions/model-billing';
import { AdminPageHeader } from '@/components/admin-page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { tokenMoney } from '@/lib/format';
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
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
      <AdminPageHeader
        icon={Receipt}
        title="Model billing"
        description="The token rates behind every price on the usage pages. Saving reprices each month already recorded, not only new runs."
      />

      {one(params.saved) === '1' && (
        <div className="flex items-start gap-2.5 rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Rates saved. Token analytics has been repriced with the new card.</p>
        </div>
      )}
      {one(params.error) && (
        <div className="flex items-start gap-2.5 rounded-card border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {one(params.error) === 'invalid'
              ? 'Enter a provider, a model, and three rates that are zero or greater.'
              : decodeURIComponent(one(params.error) ?? 'The rates could not be saved.')}
          </p>
        </div>
      )}

      {rate ? (
        <div className="space-y-4 sm:space-y-6">
          <RateSummary rate={rate} />
          <RateForm rate={rate} />
        </div>
      ) : (
        <Card className="border-destructive/40 p-5 text-sm text-destructive">
          {read.error ?? 'The rate card could not be read.'}
        </Card>
      )}
    </div>
  );
}

function RateSummary({ rate }: { rate: ModelBilling }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current rate card
          </p>
          <h2 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-xl">
            {rate.provider}
            <span className="mx-1.5 text-muted-foreground">/</span>
            {rate.model}
          </h2>
        </div>
        <span className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
          updated {new Date(rate.updatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <RateTile
          icon={Gauge}
          label="Input"
          value={rate.inputUsdPerMillion}
          hint="fresh prompt tokens"
        />
        <RateTile
          icon={Sparkles}
          label="Output"
          value={rate.outputUsdPerMillion}
          hint="tokens the model writes"
        />
        <RateTile
          icon={Coins}
          label="Cached input"
          value={rate.cachedInputUsdPerMillion}
          hint="prompt-cache reads"
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Each number is US dollars per 1,000,000 tokens. Cached input applies to the part of a
        prompt the provider serves from cache; the rest is billed at the normal input rate.
      </p>
    </Card>
  );
}

function RateTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-element border border-border/70 bg-muted/30 p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">
        {tokenMoney(value)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function RateForm({ rate }: { rate: ModelBilling }) {
  return (
    <form action={saveModelBillingAction} className="space-y-4 sm:space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold sm:text-lg">Rate card</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Which model these rates belong to. The console shows them beside every cost figure.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Provider" hint="Who serves the model, e.g. openai">
            <Input
              name="provider"
              required
              maxLength={50}
              defaultValue={rate.provider}
              placeholder="openai"
              autoComplete="off"
              className="mt-1.5 h-12 text-base sm:h-11"
            />
          </Field>
          <Field label="Model" hint="The deployment name the agent calls">
            <Input
              name="model"
              required
              maxLength={100}
              defaultValue={rate.model}
              placeholder="gpt-6-luna"
              autoComplete="off"
              className="mt-1.5 h-12 text-base sm:h-11"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-semibold sm:text-lg">Price per 1,000,000 tokens</h2>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          US dollars. Enter the rate the provider bills; changing these reprices past months too.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <RateField
            name="inputUsdPerMillion"
            label="Input"
            hint="Fresh prompt tokens"
            defaultValue={rate.inputUsdPerMillion}
          />
          <RateField
            name="outputUsdPerMillion"
            label="Output"
            hint="Tokens the model writes"
            defaultValue={rate.outputUsdPerMillion}
          />
          <RateField
            name="cachedInputUsdPerMillion"
            label="Cached input"
            hint="Prompt-cache reads"
            defaultValue={rate.cachedInputUsdPerMillion}
          />
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 sm:static sm:z-auto">
        <div className="flex flex-col gap-3 rounded-card border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:shadow-none">
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            Saving affects token analytics, the admin dashboard and every future agent run.
          </p>
          <Button type="submit" className="h-12 w-full text-base sm:h-10 sm:w-auto sm:text-sm">
            Save rates
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
}

function RateField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
}) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
          $
        </span>
        <Input
          name={name}
          type="number"
          required
          min={0}
          step="0.000001"
          inputMode="decimal"
          defaultValue={String(defaultValue)}
          className="h-12 pl-7 text-base tabular-nums sm:h-11"
        />
      </div>
      <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
}
