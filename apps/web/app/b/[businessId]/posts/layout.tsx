import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedChannels, cachedPosts } from '@/app/_cache/queries';
import { SocialContentStudio } from '@/components/social-content-studio';
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
    <SocialContentStudio
      businessId={businessId}
      initialPosts={posts}
      channels={channels}
    >
      {children}
    </SocialContentStudio>
  );
}
