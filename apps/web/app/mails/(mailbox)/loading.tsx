import { MailListPaneSkeleton } from '@/components/mails/mail-list';
import { EmptyMailDetail, MailShell } from '@/components/mails/mail-shell';

export default function MailboxLoading() {
  return (
    <MailShell mode="list" list={<MailListPaneSkeleton />} detail={<EmptyMailDetail />} />
  );
}
