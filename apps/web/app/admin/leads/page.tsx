import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, listAdminLeads, type AdminLead } from '@/lib/api';

export const instant = false;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  qualified: 'default',
  awaiting_information: 'outline',
  waitlisted: 'outline',
  contact_requested: 'secondary',
  contacted: 'secondary',
  converted: 'default',
  closed: 'destructive',
};

/**
 * Leads board (spec F): the captured details from real conversations — nothing synthesized,
 * only observed fills from actual messages — filtered by business and free-text search.
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { q } = await searchParams;

  let leads: AdminLead[] = [];
  let loadError: string | null = null;
  try {
    leads = (await listAdminLeads(bearer, q ? { search: q } : {})).leads;
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  const csvHref = '/api2/admin/ai/leads/export.csv';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Users className="h-6 w-6 text-primary" />
            Leads
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Only what customers actually wrote: contact details and requirements captured from
            their messages and the AI&apos;s replies.
          </p>
        </div>
        {csvHref && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}${csvHref}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            Download CSV
          </a>
        )}
      </div>

      <form className="flex max-w-xl gap-2" action="/admin/leads">
        <input
          type="search"
          name="q"
          placeholder="Search leads…"
          defaultValue={q}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>

      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}
      {!loadError && leads.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No leads yet</p>
        </Card>
      )}

      <div className="grid gap-3">
        {leads.map((lead) => (
          <a
            key={lead.id}
            href={`/admin/leads/${lead.id}?businessId=${lead.businessId}`}
            className="rounded-lg border border-border/50 p-4 transition-colors hover:border-primary/50"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[lead.status] ?? 'secondary'}>{lead.status}</Badge>
              <span className="font-medium">{lead.name ?? lead.businessName ?? 'unnamed'}</span>
              {lead.consent === false && <Badge variant="destructive">no-contact</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <span>{lead.phone ?? lead.email ?? 'no contact'}</span>
              <span>· {lead.interest ?? lead.requirements ?? 'no requirement noted'}</span>
              <span>· {new Date(lead.updatedAt).toLocaleString()}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
