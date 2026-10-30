import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialTickets } from '@/lib/api';
import { officialTicketPatchAction } from '@/app/actions/admin-official';

export const instant = false;

export default async function OfficialTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { ticketId } = await params;

  // The list endpoint answers in one call and the detail filter rides on it; an unknown
  // id is a 404, an outage is a readable failure — never a blank page.
  const tickets = (await adminOfficialTickets(bearer)).tickets;
  const ticket = tickets.find((row) => row.id === ticketId);
  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/official/tickets"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to tickets
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-xl font-bold sm:text-2xl">
          <LifeBuoy className="h-6 w-6 text-primary" />
          {ticket.subject || '(no subject)'}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            {ticket.type}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          From {ticket.customerName || 'Unknown'} ({ticket.customerPlatformId}) · updated{' '}
          {new Date(ticket.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {ticket.summary && (
        <Card className="p-4 text-sm">{ticket.summary}</Card>
      )}

      {ticket.conversationId && (
        <Link
          href={`/admin/official/inbox/${ticket.conversationId}`}
          className="text-sm text-primary hover:underline"
        >
          Open the conversation this came from
        </Link>
      )}

      <Card className="p-6">
        <form action={officialTicketPatchAction} className="space-y-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <select name="status" defaultValue={ticket.status} className="w-full rounded-md border bg-card px-3 py-2 text-sm">
                {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Priority</span>
              <select name="priority" defaultValue={ticket.priority} className="w-full rounded-md border bg-card px-3 py-2 text-sm">
                {['low', 'normal', 'high', 'urgent'].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Operator note</span>
            <Textarea name="notes" rows={3} defaultValue={ticket.notes ?? ''} maxLength={8000} />
          </label>
          <Button type="submit">Save ticket</Button>
        </form>
      </Card>
    </div>
  );
}
