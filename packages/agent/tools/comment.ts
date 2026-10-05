import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createCatalogTools } from '@agent/tools';
import { createComment } from '@repo/db/crud/comment';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import { replyToFacebookComment } from '@repo/integrations/facebook';
import type { SseEmitter } from '@agent/Agent';

/**
 * Tool set for the comment agent. Differs from the Messenger set in one tool:
 * `reply_comment` posts a public reply to the specific comment being handled
 * AND persists the bot's reply row (with the platform id Meta returns) — the
 * same "send + persist the exact text" rule as `send_message`, but for the
 * comment thread transport.
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

      let newCommentId: string;
      try {
        newCommentId = await postFn(context.pageToken, targetId, text);
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
        content: text,
        externalId: newCommentId,
        parentExternalId: context.parentCommentExternalId,
        state: 'done',
      });

      onSent?.(text);
      console.log(`[agent-tool] reply_comment done — commentId=${newCommentId}`);
      context.emitSse?.('tool_result', { name: 'reply_comment', result: 'Reply posted to the comment.' });
      return 'Reply posted to the comment.';
    },
    {
      name: 'reply_comment',
      description:
        "Post a public reply to the customer's comment. Only use this when the comment is directed at the page/business — do not reply to user-to-user conversation.",
      schema: z.object({
        text: z.string().describe('The public reply text to post under the comment'),
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
