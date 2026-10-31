'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Facebook, Instagram, Layers, Loader2 } from 'lucide-react';
import type { Channel } from '@/lib/api';
import { cn } from '@/lib/utils';

export function channelDisplayName(channel: Channel) {
  return channel.pageName?.trim() || channel.platformChannelId;
}

function platformLabel(platform?: string) {
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'facebook') return 'Facebook Page';
  if (!platform) return 'Channel';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function ChannelAvatar({ platform, className }: { platform?: string; className?: string }) {
  if (platform === 'facebook') {
    return (
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-white', className)}>
        <Facebook className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (platform === 'instagram') {
    return (
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', className)}>
        <Instagram className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary', className)}>
      <Layers className="h-3.5 w-3.5" />
    </span>
  );
}

function ChannelOption({
  selected,
  platform,
  name,
  subtitle,
  onSelect,
}: {
  selected: boolean;
  platform?: string;
  name: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
        selected ? 'bg-primary/[0.08]' : 'hover:bg-muted/70 active:bg-muted',
      )}
    >
      <ChannelAvatar platform={platform} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs font-semibold', selected ? 'text-primary' : 'text-foreground')}>
          {name}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{subtitle}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

export function InboxChannelFilter({
  businessId,
  channels,
  activeChannelId,
}: {
  businessId: string;
  channels: Channel[];
  activeChannelId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeChannel = channels.find((channel) => channel.id === activeChannelId);

  useEffect(() => {
    setOpen(false);
  }, [activeChannelId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (channelId?: string) => {
    setOpen(false);
    if (channelId === activeChannelId) return;
    startTransition(() => {
      router.push(`/b/${businessId}/inbox${channelId ? `?channel=${channelId}` : ''}`, { scroll: false });
    });
  };

  const triggerName = activeChannel ? channelDisplayName(activeChannel) : 'All channels';
  const triggerSubtitle = activeChannel
    ? platformLabel(activeChannel.platform)
    : `${channels.length} connected ${channels.length === 1 ? 'channel' : 'channels'}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter conversations by channel. Showing ${triggerName}`}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-left shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800/70',
          isPending && 'opacity-70',
        )}
      >
        <ChannelAvatar platform={activeChannel?.platform} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{triggerName}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{triggerSubtitle}</span>
        </span>
        {isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        )}
      </button>

      {open && (
        <div className="absolute inset-x-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl shadow-black/10">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter by channel</span>
            <span className="text-[10px] font-medium text-muted-foreground">{channels.length}</span>
          </div>
          <div
            className="max-h-64 overflow-y-auto overscroll-contain p-1.5"
            role="listbox"
            aria-label="Channels"
          >
            <ChannelOption
              selected={!activeChannelId}
              name="All channels"
              subtitle="Every connected page and account"
              onSelect={() => choose(undefined)}
            />
            {channels.map((channel) => (
              <ChannelOption
                key={channel.id}
                selected={channel.id === activeChannelId}
                platform={channel.platform}
                name={channelDisplayName(channel)}
                subtitle={platformLabel(channel.platform)}
                onSelect={() => choose(channel.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
