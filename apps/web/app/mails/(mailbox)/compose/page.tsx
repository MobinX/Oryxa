import { MailCompose } from '@/components/mails/mail-compose';
import { MailListPane } from '@/components/mails/mail-list';
import { MailErrorNotice } from '@/components/mails/mail-notice';
import { MailShell } from '@/components/mails/mail-shell';
import { one, readFolder, readOffset, type RawMailParams } from '@/lib/mail-query';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `New message — ${companyName} mail`,
  };
}

export default async function MailComposePage({
  searchParams,
}: {
  searchParams: Promise<RawMailParams>;
}) {
  const params = await searchParams;
  const folder = readFolder(params.folder);
  const q = one(params.q) || '';
  const offset = readOffset(params.offset);
  const error = one(params.error);

  return (
    <MailShell
      mode="detail"
      banner={error ? <MailErrorNotice message={error} /> : null}
      list={<MailListPane folder={folder} q={q} offset={offset} />}
      detail={<MailCompose folder={folder} q={q} offset={offset} />}
    />
  );
}
