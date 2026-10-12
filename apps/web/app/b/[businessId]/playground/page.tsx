import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { preloadPlayground } from '@/lib/playground-preload';
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
  // The test chats are this store's own rows, so they are read here rather than discovered by
  // the client after hydration — the chat list is painted full on the first render.
  const preload = await preloadPlayground(token, businessId);
  return <PlaygroundClient token={token} businessId={businessId} preload={preload} />;
}
