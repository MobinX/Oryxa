import Link from 'next/link';
import { Bell, Check, Info } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { cachedNotifications } from '@/app/_cache/queries';
import { markNotificationsReadAction } from '@/app/actions/billing';
import { PushTestButton } from '@/components/push-test-button';
import { MessengerNotificationPortal } from '@/components/messenger-notification-portal';
import { Card } from '@/components/ui/card';

function noticeTitle(kind: string): string {
  if (kind === 'order_placed') return 'New order received';
  if (kind === 'payment_order_failed') return 'Payment received but order failed';
  const unit = kind.startsWith('comment') ? 'comment' : 'messenger';
  return kind.endsWith('_100')
    ? `Your ${unit} replies are used up`
    : `You have used 80% of your ${unit} replies`;
}

export const instant = false;

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const { notifications, unreadCount, unavailable } = await cachedNotifications(token, businessId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-geist text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread · orders and this business's agent allowance`
                : 'All quiet · orders and this business\u2019s agent allowance'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <PushTestButton businessId={businessId} />
          {unreadCount > 0 && (
            <form
              action={async () => {
                'use server';
                await markNotificationsReadAction(businessId, { all: true });
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 rounded-element border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Check className="h-4 w-4" />
                Mark all read
              </button>
            </form>
          )}
        </div>
      </div>

      <MessengerNotificationPortal businessId={businessId} />

      {unavailable && (
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <Info className="h-4 w-4" />
            The notices could not be loaded
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page reads <code>/api/v1/{businessId}/notifications</code>. Reload to try again — the
            allowance itself is enforced on the server whether or not this list answers.
          </p>
        </Card>
      )}

      {!unavailable && notifications.length === 0 && (
        <Card className="hover:shadow-card">
          <p className="font-semibold">Nothing to read yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            A notice arrives when an order lands, plus one when an allowance passes 80% and another
            when it runs out — at most once per budget per cycle. Allowance notices never stop your
            own typing: the agent stops, the inbox does not.
          </p>
        </Card>
      )}

      {!unavailable && notifications.length > 0 && (
        <ul className="space-y-3">
          {notifications.map((notice) => (
            <li key={notice.id}>
              <Card
                className={`hover:shadow-card ${
                  notice.readAt ? '' : 'border-primary/40 bg-primary/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {notice.title || noticeTitle(notice.kind)}
                      {!notice.readAt && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          new
                        </span>
                      )}
                      {notice.period && (
                        <span className="text-xs font-normal text-muted-foreground">
                          cycle {notice.period}
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">{notice.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(notice.createdAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {notice.link && (
                    <Link
                      href={notice.link}
                      className="shrink-0 rounded-element border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      {notice.kind === 'order_placed'
                        ? 'Open order'
                        : notice.kind === 'payment_order_failed' || notice.kind === 'human_help'
                          ? 'Open Inbox'
                          : 'Open billing'}
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
