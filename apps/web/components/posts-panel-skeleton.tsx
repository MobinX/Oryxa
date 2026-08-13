'use client';

import { cn } from '@/lib/utils';

function Pulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />;
}

export function PostsComposerSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="space-y-2">
          <Pulse className="h-3 w-24" />
          <Pulse className="h-9 w-56" />
        </div>
        <Pulse className="h-9 w-52 rounded-xl" />
      </div>

      <div className="rounded-2xl border border-border/60 p-4 space-y-4">
        <div className="flex gap-3 border-b border-border/40 pb-3">
          <Pulse className="h-8 w-28" />
          <Pulse className="h-8 w-48" />
        </div>
        <Pulse className="h-32 w-full rounded-xl" />
        <div className="flex gap-2">
          <Pulse className="h-20 w-20 rounded-lg" />
          <Pulse className="h-20 w-20 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Pulse className="h-10 w-28" />
        <Pulse className="h-10 w-32" />
      </div>
    </div>
  );
}

export function PostsPanelSkeleton() {
  return (
    <div className="mt-4 flex min-h-[min(70vh,600px)] flex-1 flex-col overflow-hidden rounded-card border border-border/80 bg-card shadow-card lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
      <div className="flex min-h-0 flex-col border-b border-border/40 bg-muted/10 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 p-4">
          <Pulse className="h-4 w-28" />
          <Pulse className="h-8 w-24" />
        </div>
        <div className="flex gap-1 border-b border-border/40 px-4 py-2">
          <Pulse className="h-7 w-10" />
          <Pulse className="h-7 w-20" />
          <Pulse className="h-7 w-24" />
        </div>
        <div className="flex-1 space-y-2 overflow-hidden p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <Pulse className="h-3 w-24" />
                <Pulse className="h-4 w-14 rounded-full" />
              </div>
              <Pulse className="h-3 w-full" />
              <Pulse className="h-3 w-2/3" />
              <Pulse className="h-2.5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <PostsComposerSkeleton />
      </div>
    </div>
  );
}
