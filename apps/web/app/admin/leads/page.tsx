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
  searchParams: Promise<{ q?: string; status?: string; platform?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { q, status, platform } = await searchParams;

  let leads: AdminLead[] = [];
  let loadError: string | null = null;
  try {
    leads = (
      await listAdminLeads(bearer, {
        ...(q ? { search: q } : {}),
        ...(status ? { status } : {}),
        ...(platform ? { platform } : {}),
      })
    ).leads;
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  const csvParams = new URLSearchParams();
  if (q) csvParams.set('search', q);
  if (status) csvParams.set('status', status);
  if (platform) csvParams.set('platform', platform);
  const csvHref = `/api2/admin/ai/leads/export.csv${csvParams.size ? `?${csvParams}` : ''}`;

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

      <div className="flex max-w-xl flex-wrap gap-2">
        <form className="flex max-w-xl flex-1 gap-2" action="/admin/leads">
          <input
            type="search"
            name="q"
            placeholder="Search leads…"
            defaultValue={q}
            className="w-full min-w-40 rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          {status && <input type="hidden" name="status" value={status} />}
          {platform && <input type="hidden" name="platform" value={platform} />}
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Search
          </button>
        </form>
        {status && (
          <a href={`/admin/leads${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="self-center text-sm text-muted-foreground underline">
            clear status
          </a>
        )}
        {platform && (
          <a href={`/admin/leads${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="self-center text-sm text-muted-foreground underline">
            clear platform
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
        {['new', 'qualified', 'awaiting_information', 'waitlisted', 'contact_requested', 'contacted', 'converted', 'closed'].map(
          (value) => {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (platform) params.set('platform', platform);
            if (status && status === value) params.set('status', value);
            const isActive = status === value;
            if (isActive) return null;
            params.set('status', value);
            return (
              <a
                key={value}
                href={`/admin/leads?${params}`}
                className={`rounded-full border px-3 py-1.5 ${isActive ? 'border-primary bg-primary/10' : 'border-border/50 text-muted-foreground hover:text-foreground'}`}
              >
                {value.replace(/_/g, ' ')}
              </a>
            );
          },
        )}
      </div>

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
