import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listFacebookPendingPages } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { ConnectFacebookForm } from '@/components/connect-facebook-form';

export default async function ConnectFacebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { businessId } = await params;
  const { token, error } = await searchParams;
  const authToken = await requireAuth();

  if (!token) {
    // Handle the "no pages selected" case from the OAuth callback
    if (error === 'no-pages-selected') {
      return (
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Connect Facebook pages</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              No pages were returned from Facebook.
            </p>
          </div>
          <Card className="border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">No pages selected during Facebook login</h3>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              It looks like you didn&apos;t select any Facebook Pages when granting access. This usually happens if you clicked &quot;Edit Settings&quot; during the Facebook login and unselected all pages, or if your Facebook account has no Pages.
            </p>
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              <strong>To fix this:</strong> Try connecting again and make sure to select at least one Page when Facebook asks which pages to give Oryxa access to.
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
