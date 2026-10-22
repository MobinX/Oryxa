import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, getAdminLead, type AdminLead, type AdminLeadEvent } from '@/lib/api';
import { LeadStatusForm } from './lead-status-form';

export const instant = false;

const EVENT_LABELS: Record<string, string> = {
  new_lead: 'New lead',
  status_change: 'Status changed',
  consent_change: 'Consent changed',
  observed_fill: 'Details captured',
  fields_update: 'Details edited',
  scrubbed: 'Deleted on request',
};

export default async function AdminLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ businessId?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { id } = await params;
  const { businessId } = await searchParams;

  let lead: AdminLead | null = null;
  let events: AdminLeadEvent[] = [];
  let loadError: string | null = null;
  try {
    if (!businessId) throw new ApiError('businessId is required', 400);
    const res = await getAdminLead(bearer, businessId, id);
    lead = res.lead;
    events = res.events;
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  if (loadError || !lead) {
    return (
      <Card className="border-destructive/40 p-4 text-sm text-destructive">
        {loadError ?? 'Lead not found.'}
      </Card>
    );
  }

  const fields: Array<[string, string | null]> = [
    ['Name', lead.name],
    ['Business', lead.businessName],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Preferred contact', lead.contactMethod ?? null],
    ['Interest', lead.interest ?? null],
    ['Requirements', lead.requirements ?? null],
    ['Timeframe', lead.timeframe ?? null],
    ['Notes', lead.notes ?? null],
  ];

  return (
    <div className="space-y-6">
      <div>
        <a href="/admin/leads" className="text-sm text-muted-foreground underline hover:text-foreground">← All leads</a>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">
          {lead.name ?? lead.businessName ?? 'Lead'} <span className="text-muted-foreground">({lead.status})</span>
        </h1>
      </div>

      <Card className="space-y-2 p-5 text-sm">
        {fields.map(([label, value]) => (
          <p key={label}>
            <span className="text-muted-foreground">{label}: </span>
            <span className={value ? '' : 'text-muted-foreground italic'}>{value ?? 'not captured'}</span>
          </p>
        ))}
        <p>
          <span className="text-muted-foreground">Consent: </span>
          {lead.consent === false ? 'customer opted out (no-contact)' : 'okay to contact'}
        </p>
        <p className="text-muted-foreground">Platform: {lead.platform} · created {new Date(lead.createdAt).toLocaleString()}</p>
      </Card>

      <LeadStatusForm bearer={bearer} lead={lead} />

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">History</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id}>
                <span className="font-medium">{eventLabel(event.kind)}</span>{' '}
                <span className="text-muted-foreground">
                  by {event.actor} · {new Date(event.createdAt).toLocaleString()}
                  {event.data && Object.keys(event.data).length > 0
                    ? ` · ${JSON.stringify(event.data)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function eventLabel(kind: string): string {
  if (EVENT_LABELS[kind]) return EVENT_LABELS[kind];
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
