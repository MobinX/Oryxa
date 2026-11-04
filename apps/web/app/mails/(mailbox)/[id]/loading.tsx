import { MailListPaneSkeleton } from '@/components/mails/mail-list';
import { MessageSkeleton } from '@/components/mails/mail-message';
import { MailShell } from '@/components/mails/mail-shell';

/** Shown by the router the moment a row is opened, before any mailbox data returns. */
export default function MailMessageLoading() {
  return (
    <MailShell mode="detail" list={<MailListPaneSkeleton />} detail={<MessageSkeleton />} />
  );
}
