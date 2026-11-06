'use client';

import { useRouter } from 'next/navigation';

/**
 * The Ads channel picker. A native select rather than pills: a store with twenty
 * Pages would turn pills into an endless strip, while this stays one row. Picking
 * one navigates to `?channelId=`; the page's keyed Suspense boundary remounts and
 * shows the skeleton until the new numbers stream in.
 */
export function AdsChannelSelect({
  businessId,
  channels,
  days,
  current,
}: {
  businessId: string;
  channels: Array<{ id: string; pageName: string; hasAds: boolean }>;
  days: number;
  current?: string;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="shrink-0 font-semibold text-muted-foreground">Channel</span>
      <select
        value={current ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          router.push(
            `/b/${businessId}/ads?days=${days}${id ? `&channelId=${encodeURIComponent(id)}` : ''}`,
          );
        }}
        className="h-10 min-w-0 flex-1 rounded-xl border border-border/60 bg-card px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none sm:max-w-xs"
      >
        <option value="">Automatic (newest with ads)</option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.hasAds ? channel.pageName : `${channel.pageName} — no ad reporting`}
          </option>
        ))}
      </select>
    </label>
  );
}
