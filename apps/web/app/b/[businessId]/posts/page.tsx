import { requireAuth } from '@/lib/auth';
import { listPosts, listChannels, listProducts } from '@/lib/api';
import { PostsClient } from '@/components/posts-client';

export default async function PostsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  const [posts, channels, productsData] = await Promise.all([
    listPosts(token, businessId),
    listChannels(token, businessId),
    listProducts(token, businessId, { limit: 100 }),
  ]);

  return (
    <div className="flex min-h-0 flex-col h-full">
      <h1 className="text-xl font-bold sm:text-2xl">Posts & Publish</h1>
      <div className="mt-4 flex min-h-[min(70vh,600px)] flex-1 flex-col overflow-hidden rounded-card border border-border/80 bg-card shadow-card lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
        <PostsClient
          token={token}
          businessId={businessId}
          initialPosts={posts}
          channels={channels}
          products={productsData.products}
        />
      </div>
    </div>
  );
}
