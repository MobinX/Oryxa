import { MailListPane } from '@/components/mails/mail-list';
import { MailErrorNotice, MailSentNotice } from '@/components/mails/mail-notice';
import { EmptyMailDetail, MailShell } from '@/components/mails/mail-shell';
import { one, readFolder, readOffset, type RawMailParams } from '@/lib/mail-query';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Mail — ${companyName}`,
    description: `The ${companyName} admin mailbox, in a dedicated reading console.`,
  };
}

export default async function MailsPage({ searchParams }: { searchParams: Promise<RawMailParams> }) {
  const params = await searchParams;
  const folder = readFolder(params.folder);
  const q = one(params.q) || '';
  const offset = readOffset(params.offset);
  const error = one(params.error);
  const sent = one(params.sent) === '1';

  return (
    <MailShell
      mode="list"
      banner={
        error ? (
          <MailErrorNotice message={error} />
        ) : sent ? (
          <MailSentNotice />
        ) : null
      }
      list={<MailListPane folder={folder} q={q} offset={offset} />}
      detail={<EmptyMailDetail />}
    />
  );
}
