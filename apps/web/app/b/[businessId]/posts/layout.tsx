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
      <h1 className="text-xl font-bold sm:text-2xl">Posts & Publish</h1>
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
    cachedPosts(token, businessId),
    cachedChannels(token, businessId),
  ]);

  return (
    <>
      <div className="mt-4 flex min-h-[min(70vh,600px)] flex-1 flex-col overflow-hidden rounded-card border border-border/80 bg-card shadow-card lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
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
