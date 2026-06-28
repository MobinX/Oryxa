import { requireAuth } from '@/lib/auth';
import { PlaygroundClient } from '@/components/playground-client';

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  return <PlaygroundClient token={token} businessId={businessId} />;
}
