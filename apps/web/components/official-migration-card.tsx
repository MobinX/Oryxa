import { Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';

/**
 * The official-channels API answers 503 official_channels_not_migrated when the database
 * has not received migration 0036_official_channels yet. That is a deployment state, not
 * a server fault, so every official page renders an honest card instead of a raw error.
 */
export function isOfficialMigrationPending(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 503 &&
    (err.body as { error?: string } | undefined)?.error === 'official_channels_not_migrated'
  );
}

export function OfficialMigrationCard() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-600">
            Migration 0036 pending
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Official channels are not ready on this deployment: the database still misses the
            tables created by migration 0036_official_channels (official channels, tickets,
            prospects). The API deliberately answers 503 while that is true.
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Run the 0036 migration for this database, then reload this page — nothing here was
            faked to look ready in the meantime.
          </p>
        </div>
      </div>
    </Card>
  );
}
