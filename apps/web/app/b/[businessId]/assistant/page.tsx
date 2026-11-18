import { requireAuth } from '@/lib/auth';
import { getBrand } from '@/lib/brand-server';
import { getAssistantQuota } from '@/lib/api';
import { AssistantClient } from '@/components/assistant-client';

export default async function AssistantPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const token = await requireAuth();
  const { companyName } = await getBrand();
  // Paint the budget full on first render; the client refreshes it after every turn.
  const initial = await getAssistantQuota(token, businessId).catch(() => null);

  return (
    <AssistantClient
      token={token}
      businessId={businessId}
      companyName={companyName}
      initialQuota={initial?.quota ?? null}
    />
  );
}
