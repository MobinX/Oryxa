import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { PlaygroundClient } from '@/components/playground-client';
import PlaygroundSkeleton from './skeleton';

export default function PlaygroundPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<PlaygroundSkeleton />}>
      <PlaygroundContent params={params} />
    </Suspense>
  );
}

async function PlaygroundContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  return <PlaygroundClient token={token} businessId={businessId} />;
}
