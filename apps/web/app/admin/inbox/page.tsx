import Link from 'next/link';
import { Inbox as InboxIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import {
  ApiError,
  getAdminInboxThread,
  listAdminInbox,
  type AdminInboxConversation,
} from '@/lib/api';
import { ThreadPanel } from './thread-panel';

export const instant = false;

const PLATFORM_BADGE: Record<string, string> = {
  facebook: 'FB',
  instagram: 'IG',
  whatsapp: 'WA',
};

/**
 * The unified inbox (spec E): per-channel filters, AI vs human markings, lead details and
 * the human takeover — pause AI, reply as a person, resume.
 */
export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; thread?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { platform, thread } = await searchParams;

  let conversations: AdminInboxConversation[] = [];
  let loadError: string | null = null;
  try {
    conversations = (await listAdminInbox(bearer, platform ? { platform } : {})).conversations;
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  const activeThread = thread ? await getAdminInboxThread(bearer, thread).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <InboxIcon className="h-6 w-6 text-primary" />
          Inbox
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Every conversation across channels: Messenger, Instagram DMs and WhatsApp. Replies from
          here are marked as human, and while the AI is paused on a thread it never answers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
        {[
          { href: '/admin/inbox', label: 'All' },
          { href: '/admin/inbox?platform=facebook', label: 'Facebook' },
          { href: '/admin/inbox?platform=instagram', label: 'Instagram' },
          { href: '/admin/inbox?platform=whatsapp', label: 'WhatsApp' },
        ].map((tab) => {
          const active = (platform ?? '') === (tab.href.split('platform=')[1] ?? '');
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`rounded-full border px-3 py-1.5 ${
                active ? 'border-primary bg-primary/10' : 'border-border/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}
      {!loadError && conversations.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Threads appear here once a connected channel receives its first customer message.
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={thread === conversation.id ? '#' : `/admin/inbox?thread=${conversation.id}${platform ? `&platform=${platform}` : ''}`}
            className={`rounded-lg border p-4 transition-colors hover:border-primary/50 ${
              thread === conversation.id ? 'border-primary' : 'border-border/50'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{PLATFORM_BADGE[conversation.platform] ?? conversation.platform}</Badge>
              <span className="font-medium">{conversation.customerName ?? conversation.customerPlatformId}</span>
              {!conversation.aiPaused && conversation.lastMessageState === 'pending' && (
                <Badge variant="destructive">Unanswered</Badge>
              )}
              {conversation.aiPaused && <Badge variant="outline">AI paused — human takeover</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <span>{conversation.platform} · {conversation.channelLabel}</span>
              <span>· {conversation.customerPlatformId}</span>
              <span>· last change {new Date(conversation.lastStateAt).toLocaleString()}</span>
            </div>
          </Link>
        ))}
      </div>

      {activeThread && (
        <ThreadPanel bearer={bearer} thread={activeThread} platformFilter={platform} />
      )}
    </div>
  );
}
