import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { listFacebookPendingPages } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { ConnectFacebookForm } from '@/components/connect-facebook-form';
import ConnectFacebookSkeleton from './skeleton';

export default function ConnectFacebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string; detail?: string }>;
}) {
  return (
    <Suspense fallback={<ConnectFacebookSkeleton />}>
      <ConnectFacebookContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * What an empty Page list meant, in Meta's own words from the callback: the old screen
 * blamed the user for every case, and three of these are not the user's doing at all.
 */
const PAGE_DIAGNOSTICS: Record<string, { title: string; body: string; fix: string }> = {
  'no-pages-on-account': {
    title: 'This Facebook account has no Pages',
    body: 'Oryxa asked Facebook for the Pages this account administers and got none back — including any business portfolio it belongs to.',
    fix: 'Connect with the Facebook account that actually administers the Page, or create the Page first and try again.',
  },
  'pages-permission-not-granted': {
    title: 'Facebook gave Oryxa no Page access for this account',
    body: 'The login succeeded, but Facebook did not grant the permission that lists your Pages. This is an app-side setting, not something you declined.',
    fix: 'Try connecting once more; if it repeats, the Meta app needs Page access approved for your account — tell us and we can add it as a tester.',
  },
  'pages-not-controllable': {
    title: 'Your Pages are in a business portfolio we cannot act on',
    body: 'Facebook listed Pages for your business portfolio but did not hand Oryxa the access token for any of them, so your account holds a portfolio role without Page control.',
    fix: 'Ask a portfolio admin to give your account Full control of the Page (Business Suite → Page Settings → Page Access), then connect again.',
  },
  'no-pages-selected': {
    title: 'No pages selected during Facebook login',
    body: 'It looks like you didn’t select any Facebook Pages when granting access. This usually happens if you clicked "Edit Settings" during the Facebook login and unselected all pages, or if your Facebook account has no Pages.',
    fix: 'Try connecting again and make sure to select at least one Page when Facebook asks which pages to give Oryxa access to.',
  },
};

async function ConnectFacebookContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string; detail?: string }>;
}) {
  const { businessId } = await params;
  const { token, error, detail } = await searchParams;
  const authToken = await requireAuth();

  if (!token) {
    const diagnosis = error ? PAGE_DIAGNOSTICS[error] : undefined;
    if (diagnosis) {
      return (
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              No pages were returned from Facebook.
            </p>
          </div>
          <Card className="border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">{diagnosis.title}</h3>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{diagnosis.body}</p>
            {detail && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Found: {decodeURIComponent(detail)}
              </p>
            )}
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              <strong>To fix this:</strong> {diagnosis.fix}
            </p>
            <div className="mt-4">
              <Link
                href={`/b/${businessId}/channels`}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-[12px] text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                ← Try again
              </Link>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
        <Card className="p-4 text-sm text-red-600">
          Missing page selection token. Start over from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  let pages: Awaited<ReturnType<typeof listFacebookPendingPages>>;
  try {
    pages = await listFacebookPendingPages(authToken, businessId, token);
  } catch {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
        <Card className="p-4 text-sm text-red-600">
          This link expired or is invalid. Connect Facebook again from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  // Check if any pages are already connected to OTHER businesses (already connected flag
  // is set per-business, so "connected" here means connected to THIS business)
  const alreadyConnectedElsewhere = pages.filter((p) => p.connected);
  const hasOnlyAlreadyConnected = pages.length > 0 && pages.every((p) => p.connected);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Choose Facebook pages</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Select the pages you want to connect to this business.
        </p>
      </div>

      {error === 'no-selection' && (
        <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Select at least one page to connect.
        </Card>
      )}

      {alreadyConnectedElsewhere.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <strong>Note:</strong> Some pages shown below are already connected to this business. If you select them again, their access token will be refreshed. Pages connected to <em>other</em> businesses in Oryxa may still appear — selecting them here will connect them to this business too.
        </Card>
      )}

      {hasOnlyAlreadyConnected && (
        <Card className="border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          All these pages are already connected. You can select them to refresh the Facebook access token.
        </Card>
      )}

      <ConnectFacebookForm businessId={businessId} token={token} pages={pages} />
    </div>
  );
}
