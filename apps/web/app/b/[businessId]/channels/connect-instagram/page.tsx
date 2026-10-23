import Link from 'next/link';
import { Suspense } from 'react';
import { Instagram } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listInstagramPendingAccounts } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { ConnectInstagramForm } from '@/components/connect-instagram-form';
import ConnectFacebookSkeleton from '../connect-facebook/skeleton';
import { getBrand } from '@/lib/brand-server';

export default function ConnectInstagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string; detail?: string }>;
}) {
  return (
    <Suspense fallback={<ConnectFacebookSkeleton />}>
      <ConnectInstagramContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function noAccount(companyName: string) {
  return {
    title: 'No Instagram professional account was found',
    body: `Facebook listed your Pages, but none of them names an Instagram professional account that ${companyName} can answer as.`,
    fix: 'In the Instagram app, open Settings → Account type and tools and make sure the account is Professional (Business or Creator), then link it to the Facebook Page in your Meta Business settings. After that, connect Instagram again.',
  };
}

async function ConnectInstagramContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ token?: string; error?: string; detail?: string }>;
}) {
  const { businessId } = await params;
  const { token, error, detail } = await searchParams;
  const authToken = await requireAuth();
  const { companyName } = await getBrand();

  if (!token) {
    if (error === 'no-instagram-account') {
      const diagnosis = noAccount(companyName);
      return (
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Instagram className="h-6 w-6" />
              Connect Instagram
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              No Instagram professional account was returned from Meta.
            </p>
          </div>
          <Card className="border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">{diagnosis.title}</h3>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{diagnosis.body}</p>
            {detail && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {decodeURIComponent(detail)}
              </p>
            )}
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              <strong>To fix this:</strong> {diagnosis.fix}
            </p>
            <div className="mt-4">
              <Link
                href={`/b/${businessId}/channels`}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-amber-600 px-5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
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
        <h1 className="text-xl font-bold sm:text-2xl">Connect Instagram</h1>
        <Card className="p-4 text-sm text-red-600">
          Missing account selection token. Start over from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  let accounts: Awaited<ReturnType<typeof listInstagramPendingAccounts>>;
  try {
    accounts = await listInstagramPendingAccounts(authToken, businessId, token);
  } catch {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold sm:text-2xl">Connect Instagram</h1>
        <Card className="p-4 text-sm text-red-600">
          This link expired or is invalid. Connect Instagram again from{' '}
          <Link href={`/b/${businessId}/channels`} className="underline">
            Channels
          </Link>
          .
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Instagram className="h-6 w-6" />
          Choose Instagram accounts
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Select the professional accounts you want this store to answer for.
        </p>
      </div>

      {error === 'no-selection' && (
        <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Select at least one Instagram account to connect.
        </Card>
      )}

      <ConnectInstagramForm businessId={businessId} token={token} accounts={accounts} />

      <p className="text-xs text-[var(--muted-foreground)]">
        The agent uses the same system prompt and tools as your Messenger channels. Direct
        messages and comments are answered with your products, orders and delivery details.
      </p>
    </div>
  );
}
