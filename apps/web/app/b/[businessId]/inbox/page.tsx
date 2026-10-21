import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { listConversations, listMessages } from '@/lib/api';
import { InboxWorkspaceClient } from '@/components/inbox-workspace-client';
import InboxSkeleton from './skeleton';

export default function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function InboxContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { businessId } = await params;
  const { c: selectedId } = await searchParams;
  const token = await requireAuth();
  const [conversations, messages] = await Promise.all([
    listConversations(token, businessId).catch(() => []),
    selectedId ? listMessages(token, businessId, selectedId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <InboxWorkspaceClient
      businessId={businessId}
      initialConversations={conversations}
      initialMessages={messages}
      selectedConversationId={selectedId}
    />
  );
}
