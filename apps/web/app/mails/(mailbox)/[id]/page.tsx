import { Suspense } from 'react';
import { MailListPane } from '@/components/mails/mail-list';
import { MailMessage, MessageSkeleton } from '@/components/mails/mail-message';
import { MailErrorNotice } from '@/components/mails/mail-notice';
import { MailShell } from '@/components/mails/mail-shell';
import { one, readFolder, readOffset, type RawMailParams } from '@/lib/mail-query';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Message — ${companyName} mail`,
  };
}

export default async function MailMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawMailParams>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const folder = readFolder(query.folder);
  const q = one(query.q) || '';
  const offset = readOffset(query.offset);
  const error = one(query.error);

  return (
    <MailShell
      mode="detail"
      banner={error ? <MailErrorNotice message={error} /> : null}
      list={<MailListPane folder={folder} q={q} offset={offset} selectedId={route.id} />}
      detail={
        <Suspense key={route.id} fallback={<MessageSkeleton />}>
          <MailMessage id={route.id} folder={folder} q={q} offset={offset} />
        </Suspense>
      }
    />
  );
}
