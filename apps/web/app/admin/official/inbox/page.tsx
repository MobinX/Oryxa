import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AdminPageHeader } from '@/components/admin-page-header';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialConversations, type OfficialConversation } from '@/lib/api';
import {
  isOfficialMigrationPending,
  OfficialMigrationCard,
} from '@/components/official-migration-card';

export const instant = false;

/**
 * The official inbox list reads straight from the database this app shares with the API:
 * one render, no token travel, and the AI claim column is already fact on the page.
 */
export default async function OfficialInboxPage() {
  await requireConsoleBearer();

  let rows: OfficialConversation[] = [];
  let loadError: string | null = null;
  let migrationPending = false;
  try {
    rows = (await adminOfficialConversations(await requireConsoleBearer())).conversations;
  } catch (err) {
    if (isOfficialMigrationPending(err)) {
      migrationPending = true;
    } else {
      loadError = 'The conversation list could not be read.';
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Inbox}
        title="Official inbox"
        description="Every person who messaged an official channel. The AI answers as a person while it is enabled; a taken-over thread stays yours until you resume it."
      />

      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          <p role="alert">{loadError}</p>
        </Card>
      )}
      {migrationPending && <OfficialMigrationCard />}

      {rows.length === 0 && !loadError && !migrationPending && (
        <Card className="py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </span>
          <p className="mt-3 font-semibold">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Once a customer DMs an official channel on Facebook, Instagram or WhatsApp, their
            thread appears here.
          </p>
        </Card>
      )}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/official/inbox/${row.id}`}
              className="block rounded-element border border-border/60 bg-card p-4 shadow-sm outline-none transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {row.customerName || 'Unknown customer'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.platform} · {row.customerPlatformId}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      row.status === 'pending'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {row.status}
                  </span>
                  {row.aiPaused && (
                    <span className="mt-1 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                      taken over
                    </span>
                  )}
                  <p className="mt-1 text-muted-foreground">
                    {new Date(row.stateAt).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
