import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createCatalogTools } from '@agent/tools';
import { createComment } from '@repo/db/crud/comment';
import { createMessage, getOrCreateConversation } from '@repo/db/crud/conversation';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import { replyToFacebookComment, sendCommenterMessage } from '@repo/integrations/facebook';
import type { SseEmitter } from '@agent/Agent';

/**
 * What the public thread says once the answer itself went to the commenter's inbox. The
 * customer asked in public and is answered in private, so this only has to point at it.
 */
const CHECK_MESSENGER_REPLY =
  'I have sent you the details in Messenger — please check your inbox. Message the page if you need anything else.';

/**
 * Tool set for the comment agent. Differs from the Messenger set in one tool:
 * `reply_comment` carries the answer into the commenter's Messenger inbox and posts
 * `CHECK_MESSENGER_REPLY` under their comment — and when the inbox cannot be reached it
 * posts the answer itself publicly, so a refused send never leaves a pointing hand
 * aimed at nothing.
 */
export function createCommentAgentTools(
  context: {
    businessId: string;
    commentThreadId: string;
    pageToken: string;
    /** Platform comment id of the customer comment currently being replied to. */
    parentCommentExternalId: string;
    /** Graph node to POST /comments on. Nested replies must target the top-level comment. */
    graphReplyToId?: string;
    customerName?: string | null;
    /** Channel + commenter of this thread: without both there is no inbox to write into. */
    channelId?: string;
    commenterPlatformId?: string | null;
    emitSse?: SseEmitter;
    /**
     * Override the Graph reply function (e.g. no-op in test mode). The mirror of
     * `sendMessageOverride` in the Messenger set: a reply that goes nowhere on the wire
     * must not be charged, and without this seam a comment test run would manufacture
     * usage out of nothing.
     */
    replyCommentOverride?: (pageToken: string, targetId: string, text: string) => Promise<string>;
  },
  onSent?: (text: string) => void,
) {
  /**
   * Claimed before the first await: the model can emit two reply_comment calls
   * in one turn and they run concurrently, so only a check that precedes the
   * Graph POST keeps a duplicated reply off the public thread.
   */
  let replyClaimed = false;

  /**
   * Writes the answer into the commenter's own Messenger thread, so a question asked in
   * public is answered in private and the Messenger agent later knows what this customer
   * was already told. Returns false whenever the private route is not available or not
   * allowed — no commenter on this thread, a test run that puts nothing on the wire, an
   * exhausted message allowance, Meta refusing the send — and the caller then answers in
   * the comment itself rather than pointing at an empty inbox.
   */
  async function sendAnswerToInbox(text: string, chargeable: boolean): Promise<boolean> {
    if (!chargeable || !context.channelId || !context.commenterPlatformId) return false;

    let chargedPeriod: string | null = null;
    try {
      const budget = await spendQuotaUnit(context.businessId, 'message');
      if (!budget.spent) {
        console.log('[agent-tool] reply_comment answering in public — the message allowance is used up');
        return false;
      }
      chargedPeriod = budget.period;
    } catch (err) {
      // Fails open like every other gate: a database that will not answer must not mute the agent.
      console.error('[agent-tool] message quota spend failed, sending uncharged:', err);
    }

    try {
      await sendCommenterMessage(context.pageToken, context.parentCommentExternalId, text);
    } catch (err) {
      console.error('[agent-tool] reply_comment could not reach the inbox, answering in public:', err);
      if (chargedPeriod) {
        try {
          await refundQuotaUnit(context.businessId, 'message', chargedPeriod);
        } catch (refundErr) {
          console.error('[agent-tool] message quota refund failed:', refundErr);
        }
      }
      return false;
    }

    try {
      const conversation = await getOrCreateConversation(
        context.businessId,
        context.channelId,
        context.commenterPlatformId,
        context.customerName ?? undefined,
      );
      await createMessage({
        conversationId: conversation.id,
        from: 'self',
        content: text,
        state: 'done',
      });
    } catch (err) {
      // The customer already has the answer. Bookkeeping that fails must not undo it,
      // and must not stop the public pointer from being posted either.
      console.error('[agent-tool] reply_comment could not record the inbox message:', err);
    }

    return true;
  }

  const replyCommentTool = tool(
    async ({ text }) => {
      if (replyClaimed) {
        console.log(`[agent-tool] reply_comment rejected — a reply is already in flight for this turn`);
        return 'Error: The reply to this comment is already posted. Do not call reply_comment again. Stop calling tools and end the turn.';
      }
      replyClaimed = true;

      context.emitSse?.('tool_call', { name: 'reply_comment', args: { text } });
      console.log(`[agent-tool] reply_comment called — text="${text}"`);

      // Idempotency check: check if a reply has already been persisted for this comment
      const { db } = await import('@repo/db/client');
      const { comments } = await import('@repo/db/schema');
      const { and, eq, isNull } = await import('drizzle-orm');

      const existingReply = await db.query.comments.findFirst({
        where: and(
          eq(comments.commentThreadId, context.commentThreadId),
          eq(comments.from, 'self'),
          eq(comments.parentExternalId, context.parentCommentExternalId),
          isNull(comments.deletedAt),
        ),
      });

      if (existingReply) {
        console.log(`[agent-tool] reply_comment skipped: already replied to comment ${context.parentCommentExternalId} (Reply ID: ${existingReply.externalId})`);
        context.emitSse?.('tool_result', { name: 'reply_comment', result: 'Reply already posted to the comment.' });
        return 'Reply already posted to the comment.';
      }

      const targetId = context.graphReplyToId ?? context.parentCommentExternalId;
      const postFn = context.replyCommentOverride ?? replyToFacebookComment;

      // The same rule as the Messenger tool: one reply actually posted is one unit of the
      // comment budget. Charged only now, after the duplicate check above refused nothing,
      // so a reply that was never going to be posted costs nothing.
      const chargeable = !context.replyCommentOverride && text.trim() !== 'SILENT';
      let chargedPeriod: string | null = null;
      if (chargeable) {
        try {
          const budget = await spendQuotaUnit(context.businessId, 'comment');
          if (!budget.spent) {
            console.log(`[agent-tool] reply_comment refused — the comment allowance is used up`);
            context.emitSse?.('tool_result', {
              name: 'reply_comment',
              result: "This cycle's comment replies are used up and the owner has been notified.",
            });
            return "This cycle's comment replies are used up and the owner has been notified. Do not try again. End the turn.";
          }
          chargedPeriod = budget.period;
        } catch (err) {
          // Fails open like the gate: a database that will not answer must not mute the agent.
          console.error('[agent-tool] quota spend failed, posting uncharged:', err);
        }
      }

      // The answer goes to the inbox first: only once we know whether it landed can we
      // decide what the public thread should say.
      const sentToInbox = await sendAnswerToInbox(text, chargeable);
      const publicText = sentToInbox ? CHECK_MESSENGER_REPLY : text;

      let newCommentId: string;
      try {
        newCommentId = await postFn(context.pageToken, targetId, publicText);
      } catch (err) {
        if (chargedPeriod) {
          try {
            await refundQuotaUnit(context.businessId, 'comment', chargedPeriod);
          } catch (refundErr) {
            console.error('[agent-tool] quota refund failed:', refundErr);
          }
        }
        throw err;
      }
      await createComment({
        commentThreadId: context.commentThreadId,
        from: 'self',
        content: publicText,
        externalId: newCommentId,
        parentExternalId: context.parentCommentExternalId,
        state: 'done',
      });

      onSent?.(publicText);
      const result = sentToInbox
        ? 'Answer sent to the customer in Messenger; the comment now tells them to check their inbox. Do not repeat the details. End the turn.'
        : 'Reply posted to the comment.';
      console.log(`[agent-tool] reply_comment done — commentId=${newCommentId} inbox=${sentToInbox}`);
      context.emitSse?.('tool_result', { name: 'reply_comment', result });
      return result;
    },
    {
      name: 'reply_comment',
      description:
        'Answer the commenter. The text you give is sent privately into their Messenger inbox, and a short '
        + 'public reply telling them to check Messenger is posted under their comment for you. So write the '
        + 'whole answer here — price, stock, sizes, the order steps — and never write "check your inbox" as '
        + 'the answer. Only use this when the comment is directed at the page/business; do not reply to '
        + 'user-to-user conversation.',
      schema: z.object({
        text: z.string().describe('The answer to deliver to this customer in Messenger; the public comment reply is written for you'),
      }),
    },
  );

  return [
    ...createCatalogTools({
      businessId: context.businessId,
      customerName: context.customerName,
      emitSse: context.emitSse,
    }),
    replyCommentTool,
  ];
}
