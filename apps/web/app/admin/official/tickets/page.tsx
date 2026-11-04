import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialTickets, ApiError, type OfficialTicket } from '@/lib/api';
import { officialTicketPatchAction } from '@/app/actions/admin-official';
import { AdminPageHeader } from '@/components/admin-page-header';
import {
  isOfficialMigrationPending,
  OfficialMigrationCard,
} from '@/components/official-migration-card';

export const instant = false;

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default async function OfficialTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const bearer = await requireConsoleBearer();
  const params = await searchParams;

  let tickets: OfficialTicket[] = [];
  let loadError: string | null = null;
  let migrationPending = false;
  const status = params.status ?? 'active';
  try {
    tickets = (
      await adminOfficialTickets(bearer, { type: params.type, status: params.status })
    ).tickets;
  } catch (err) {
    if (isOfficialMigrationPending(err)) {
      migrationPending = true;
    } else {
      loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The ticket list could not be read.';
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={LifeBuoy}
        title="Tickets"
        description="Support and security reports the official AI logged while talking to people. One open ticket per problem: the AI appends, you respond."
        actions={
          <form className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">State</span>
              <select
                name="status"
                defaultValue={status}
                className="h-10 rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {['all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'].map((value) => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All states' : STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" className="h-10">
              Filter
            </Button>
          </form>
        }
      />

      {params.error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          <p role="alert">{params.error}</p>
        </Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          <p role="alert">{loadError}</p>
        </Card>
      )}
      {migrationPending && <OfficialMigrationCard />}

      {!loadError && !migrationPending && tickets.length === 0 && (
        <Card className="py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <LifeBuoy className="h-5 w-5 text-muted-foreground" />
          </span>
          <p className="mt-3 font-semibold">No tickets{status === 'all' ? '' : ` in ${STATUS_LABEL[status] ?? status}`} right now</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            When the official AI logs a problem while talking to someone, it lands here.
          </p>
        </Card>
      )}

      <ul className="space-y-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.type === 'security'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                  }`}
                >
                  {ticket.type}
                </span>
                <Link href={`/admin/official/tickets/${ticket.id}`} className="rounded font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50">
                  {ticket.subject || '(no subject)'}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {ticket.customerName || ticket.customerPlatformId}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.status === 'resolved' || ticket.status === 'closed'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {ticket.status}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.priority === 'urgent'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : ticket.priority === 'high'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ticket.priority}
                </span>
              </div>
              {ticket.summary && (
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{ticket.summary}</p>
              )}
              <form action={officialTicketPatchAction} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select
                  name="status"
                  defaultValue={ticket.status}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label={`Status of ticket ${ticket.id}`}
                >
                  {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
                <select
                  name="priority"
                  defaultValue={ticket.priority}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label={`Priority of ticket ${ticket.id}`}
                >
                  {['low', 'normal', 'high', 'urgent'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline" className="h-7 px-2 text-xs">
                  Save
                </Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
