import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedAdsOverview } from '@/app/_cache/queries';
import AdsSkeleton from './skeleton';
import { Card } from '@/components/ui/card';
import { CircleDollarSign, Eye, MousePointerClick, Users } from 'lucide-react';
import { money, whole } from '@/lib/format';

const PERIODS = [7, 30, 90];

/** The pills offer three windows; anything inside the API's own bound is accepted. */
function readDays(value: string | undefined): number {
  const days = Number.parseInt(value ?? '', 10);
  return Number.isInteger(days) && days > 0 ? Math.min(days, 365) : 30;
}

export default function AdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ days?: string; accountId?: string }>;
}) {
  return (
    <Suspense fallback={<AdsSkeleton />}>
      <AdsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AdsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ days?: string; accountId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const days = readDays(query.days);
  const accountId = query.accountId || undefined;
  const token = await requireAuth();
  const overview = await cachedAdsOverview(token, businessId, days, accountId);

  const base = `/b/${businessId}/ads`;
  const windowHref = (windowDays: number, account?: string) =>
    `${base}?days=${windowDays}${account ? `&accountId=${encodeURIComponent(account)}` : ''}`;

  if (!overview.connected) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ads
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Spend and delivery for your Meta ad accounts, read live from Facebook.
          </p>
        </div>
        <Card className="border-border/60 p-6">
          <p className="font-semibold text-foreground">Ad reporting is not connected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {overview.error ??
              'Connect Facebook with ad reporting checked, and spend, impressions, clicks and reach show up here.'}
          </p>
          <Link
            href={`/b/${businessId}/channels`}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-105"
          >
            Go to Integrations
          </Link>
        </Card>
      </div>
    );
  }

  const totals = overview.totals ?? {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
  };
  const campaigns = overview.campaigns ?? [];
  const byAgeGender = overview.byAgeGender ?? [];
  const accounts = overview.accounts ?? [];
  const currentAccount = overview.account?.id ?? accountId;

  return (
    <div className="space-y-8">
      {/* Title, account & period selectors */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ads
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {overview.account ? (
              <>
                <strong className="text-foreground">{overview.account.name}</strong>
                {' — '}last {days} days, read live from Meta.
              </>
            ) : (
              <>Last {days} days, read live from Meta.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 && (
            <div className="flex items-center rounded-xl border border-border/60 bg-muted/40 p-1">
              {accounts.map((account) => (
                <Link
                  key={account.id}
                  href={windowHref(days, account.id)}
                  aria-current={account.id === currentAccount ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    account.id === currentAccount
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {account.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-center rounded-xl border border-border/60 bg-muted/40 p-1">
            {PERIODS.map((period) => (
              <Link
                key={period}
                href={windowHref(period, currentAccount)}
                aria-current={period === days ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  period === days
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {period}d
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Window metrics */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Spend"
          icon={CircleDollarSign}
          value={money(totals.spend)}
          sub={`CPC ${money(totals.cpc)} · CPM ${money(totals.cpm)}`}
        />
        <Stat
          label="Impressions"
          icon={Eye}
          value={whole(totals.impressions)}
          sub={`CTR ${totals.ctr.toFixed(2)}%`}
        />
        <Stat
          label="Clicks"
          icon={MousePointerClick}
          value={whole(totals.clicks)}
          sub={`${whole(totals.reach)} people reached`}
        />
        <Stat
          label="Reach"
          icon={Users}
          value={whole(totals.reach)}
          sub="Unique people who saw an ad"
        />
      </div>

      {/* Campaigns */}
      <Card className="border-border/60 p-6">
        <h4 className="font-geist text-lg font-bold text-foreground">Campaigns</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Priciest first, over the selected window.
        </p>
        {campaigns.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No delivery in this window — nothing spent, so there is nothing to break down.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4 text-right tabular-nums">Spend</th>
                  <th className="pb-2 pr-4 text-right tabular-nums">Impr.</th>
                  <th className="pb-2 pr-4 text-right tabular-nums">Clicks</th>
                  <th className="pb-2 text-right tabular-nums">CTR</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{campaign.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{money(campaign.spend)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {whole(campaign.impressions)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{whole(campaign.clicks)}</td>
                    <td className="py-2.5 text-right tabular-nums">{campaign.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Age & gender split */}
      <Card className="border-border/60 p-6">
        <h4 className="font-geist text-lg font-bold text-foreground">Who saw the ads</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Delivery split by age and gender.</p>
        {byAgeGender.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No delivery in this window — nothing spent, so there is nothing to break down.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 pr-4">Age</th>
                  <th className="pb-2 pr-4">Gender</th>
                  <th className="pb-2 pr-4 text-right tabular-nums">Spend</th>
                  <th className="pb-2 pr-4 text-right tabular-nums">Impr.</th>
                  <th className="pb-2 text-right tabular-nums">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {byAgeGender.map((row) => (
                  <tr
                    key={`${row.age}-${row.gender}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-medium text-foreground">{row.age}</td>
                    <td className="py-2.5 pr-4 capitalize text-muted-foreground">{row.gender}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{money(row.spend)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {whole(row.impressions)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{whole(row.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Eye;
}) {
  return (
    <Card className="border-border/60 p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-foreground tabular-nums">
        {value}
      </h4>
      <div className="mt-3 border-t border-border/40 pt-2.5 text-xs text-muted-foreground tabular-nums">
        {sub}
      </div>
    </Card>
  );
}
