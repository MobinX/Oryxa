export interface PostPublisher {
  publish(
    channel: { apiToken: string; platformChannelId: string },
    content: string,
    mediaUrls?: string[],
  ): Promise<string>; // returns platformPostId

  syncStats(
    channel: { apiToken: string },
    platformPostId: string,
  ): Promise<{
    likeCount: number;
    commentCount: number;
    shareCount: number;
    reachCount: number;
  }>;
}

const publishers: Record<string, PostPublisher> = {};

export function registerPublisher(platform: string, publisher: PostPublisher) {
  publishers[platform] = publisher;
}

export function getPublisher(platform: string): PostPublisher {
  const publisher = publishers[platform];
  if (!publisher) {
    throw new Error(`No publisher registered for platform: ${platform}`);
  }
  return publisher;
}
