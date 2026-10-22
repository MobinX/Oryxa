import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialTickets, type OfficialTicket } from '@/lib/api';
import { officialTicketPatchAction } from '@/app/actions/admin-official';

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
  const status = params.status ?? 'active';
  try {
    tickets = (
      await adminOfficialTickets(bearer, { type: params.type, status: params.status })
    ).tickets;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'The ticket list could not be read.';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Tickets
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Support and security reports the official AI logged while talking to people. One
            open ticket per problem: the AI appends, you respond.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">State</span>
            <select
              name="status"
              defaultValue={status}
              className="h-10 rounded-md border bg-card px-3 text-sm"
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
      </div>

      {params.error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{params.error}</Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}

      {!loadError && tickets.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No tickets{status === 'all' ? '' : ` in ${STATUS_LABEL[status] ?? status}`} right now</p>
        </Card>
      )}

      <ul className="space-y-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.type === 'security' ? 'text-red-600' : 'text-primary'
                  }`}
                  style={{ backgroundColor: ticket.type === 'security' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)' }}
                >
                  {ticket.type}
                </span>
                <Link href={`/admin/official/tickets/${ticket.id}`} className="font-semibold hover:underline">
                  {ticket.subject || '(no subject)'}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {ticket.customerName || ticket.customerPlatformId}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.status === 'resolved' || ticket.status === 'closed'
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600'
                  }`}
                >
                  {ticket.status}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    ticket.priority === 'urgent'
                      ? 'bg-red-500/15 text-red-600'
                      : ticket.priority === 'high'
                        ? 'bg-amber-500/15 text-amber-600'
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
                  className="rounded-md border bg-background px-2 py-1 text-xs"
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
                  className="rounded-md border bg-background px-2 py-1 text-xs"
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
