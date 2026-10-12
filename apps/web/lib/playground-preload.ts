import {
  getDefaultAgent,
  listChannels,
  listConversations,
  listMessages,
  type Agent,
  type Channel,
  type Conversation,
} from '@/lib/api';

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
  /** Null on the first visit to a store, before its sandbox channel exists. */
  channel: Channel | null;
  conversations: Conversation[];
  /** The newest chat's messages, so the pane is not blank while they are re-fetched. */
  messages: { id: string; from: string; content: string; time: string }[];
  /**
   * The agent answering this store: its system prompt, the two wording blocks and the built-in
   * text they fall back to. Only the operator console asks for it, so a merchant's page never
   * reads or ships any of it.
   */
  agent?: Agent | null;
};

/**
 * The playground's chats come from the store's own sandbox channel, so the server can read them
 * before rendering: a merchant who opens the page sees the threads they already have instead of an
 * empty list that fills in a second later.
 *
 * It never creates the sandbox channel — a page view is not a write, and the client seeds it on
 * mount as it always has. So the first visit to a store's playground is the one that stays unpaved.
 *
 * `withAgent` is the console's request for the prompt editors too. `getDefaultAgent` does mint a
 * store's agent row when it has none, but only when it has none: the row the editor would write a
 * moment later, with the reviewed default text in it, and it never rewrites an existing prompt.
 */
export async function preloadPlayground(
  token: string,
  businessId: string,
  { withAgent = false }: { withAgent?: boolean } = {},
): Promise<PlaygroundPreload | null> {
  try {
    const [channels, agent] = await Promise.all([
      listChannels(token, businessId),
      withAgent ? getDefaultAgent(token, businessId) : Promise.resolve(null),
    ]);

    const channel = channels.find((c) => c.platformChannelId === sandboxPageId(businessId));
    if (!channel) return { channel: null, conversations: [], messages: [], agent };

    const conversations = await listConversations(token, businessId, {
      channelId: channel.id,
      limit: PLAYGROUND_CHAT_PAGE,
    });
    const newest = conversations[0];
    const messages = newest ? (await listMessages(token, businessId, newest.id)) ?? [] : [];

    return { channel, conversations, messages, agent };
  } catch (err) {
    // An expired account token redirects to sign-in from inside apiFetch; swallowing that would
    // render a playground with no chats for someone who is being signed out anyway.
    if (String((err as { digest?: unknown })?.digest ?? '').includes('NEXT_REDIRECT')) throw err;
    console.error('Failed to preload the playground chats:', err);
    return null;
  }
}
