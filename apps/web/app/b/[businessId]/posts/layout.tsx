import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedChannels, cachedPosts } from '@/app/_cache/queries';
import { PostsClient } from '@/components/posts-client';
import PostsSkeleton from './skeleton';

export default function PostsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="flex min-h-0 flex-col h-full">
      <Suspense fallback={<PostsSkeleton />}>
        <PostsBody params={params}>{children}</PostsBody>
      </Suspense>
    </div>
  );
}

async function PostsBody({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  const [posts, channels] = await Promise.all([
    cachedPosts(token, businessId).catch(() => []),
    cachedChannels(token, businessId).catch(() => []),
  ]);

  return (
    <>
      <div className="mt-4 flex min-h-[min(70vh,600px)] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111427] lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
        <PostsClient
          token={token}
          businessId={businessId}
          initialPosts={posts}
          channels={channels}
        />
      </div>
      <div className="hidden">{children}</div>
    </>
  );
}
