import { listChannels, listConversations, listMessages, type Channel, type Conversation } from '@/lib/api';

/**
 * The page id a test chat runs on, so a test is never mistaken for a real customer thread.
 * Namespaced by store: (platform, page id) is unique across live channels, so one shared id
 * would be claimed by the first store that opened the playground and leave every other store —
 * and the operator's sandbox — unable to create its own.
 */
export const sandboxPageId = (businessId: string) => `mock-channel-${businessId}`;

/** How many test chats the page paints before the client asks for the next page. */
export const PLAYGROUND_CHAT_PAGE = 15;

export type PlaygroundPreload = {
  channel: Channel;
  conversations: Conversation[];
  /** The newest chat's messages, so the pane is not blank while they are re-fetched. */
  messages: { id: string; from: string; content: string; time: string }[];
};

/**
 * The playground's chats come from the store's own sandbox channel, so the server can read them
 * before rendering: a merchant who opens the page sees the threads they already have instead of an
 * empty list that fills in a second later.
 *
 * It never creates the sandbox channel — a page view is not a write, and the client seeds it on
 * mount as it always has. So the first visit to a store's playground is the one that stays unpaved.
 */
export async function preloadPlayground(
  token: string,
  businessId: string,
): Promise<PlaygroundPreload | null> {
  try {
    const channels = await listChannels(token, businessId);
    const channel = channels.find((c) => c.platformChannelId === sandboxPageId(businessId));
    if (!channel) return null;

    const conversations = await listConversations(token, businessId, {
      channelId: channel.id,
      limit: PLAYGROUND_CHAT_PAGE,
    });
    const newest = conversations[0];
    const messages = newest ? (await listMessages(token, businessId, newest.id)) ?? [] : [];

    return { channel, conversations, messages };
  } catch (err) {
    // An expired account token redirects to sign-in from inside apiFetch; swallowing that would
    // render a playground with no chats for someone who is being signed out anyway.
    if (String((err as { digest?: unknown })?.digest ?? '').includes('NEXT_REDIRECT')) throw err;
    console.error('Failed to preload the playground chats:', err);
    return null;
  }
}
