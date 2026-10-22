import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createCatalogTools } from '@agent/tools';
import { createComment } from '@repo/db/crud/comment';
import { createMessage, getOrCreateConversation } from '@repo/db/crud/conversation';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import { replyToFacebookComment, sendCommenterMessage } from '@repo/integrations/facebook';
import { replyToInstagramComment } from '@repo/integrations/instagram';
import type { SseEmitter } from '@agent/Agent';

/** Reject public drafts that could expose private purchase or contact details. */
export function publicCommentReplyViolation(
  text: string,
  privateMessageSent: boolean,
  customerName?: string | null,
): string | null {
  if (text.trim() === 'SILENT') return 'SILENT is a no-reply signal and must never be posted publicly.';
  if (!privateMessageSent && /\b(?:inbox|messenger|dm|direct message|check your messages|sent you a message)\b|ইনবক্স|মেসেঞ্জার|মেসেজ পাঠিয়েছি|মেসেজ পাঠিয়েছি/i.test(text)) {
    return 'Do not direct the commenter to Messenger unless a private message succeeded in this turn.';
  }
  const normalized = text.normalize('NFKC').toLocaleLowerCase();
  if (customerName?.trim() && normalized.includes(customerName.trim().normalize('NFKC').toLocaleLowerCase())) {
    return 'Do not include the commenter’s personal name in a public reply.';
  }
  if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{7,}\d)|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|[$৳]|\b(?:BDT|taka|tk)\b|[\d০-৯][\d০-৯,.]*\s*(?:টাকা|৳)|(?:price|cost|stock|left|available|pieces|units|pcs|দাম|মূল্য|স্টক|বাকি)[^.!?]{0,24}[\d০-৯]|[\d০-৯][^.!?]{0,24}(?:price|cost|stock|left|available|pieces|units|pcs|দাম|মূল্য|স্টক|বাকি)|(?:\b(?:house|flat|apartment|road|street|address|block)\b|বাসা|বাড়ি|বাড়ি|রোড|ঠিকানা|ফ্ল্যাট)[^.!?]{0,24}[\d০-৯]|[\d০-৯][^.!?]{0,24}(?:\b(?:house|flat|apartment|road|street|address|block)\b|বাসা|বাড়ি|বাড়ি|রোড|ঠিকানা|ফ্ল্যাট)/i.test(text)) {
    return 'Public comments cannot contain customer contact details, internal IDs, exact prices, or exact stock counts.';
  }
  return null;
}

/**
 * Tool set for the comment agent. Two delivery tools, and the agent picks which one the
 * question deserves: `reply_comment` says the given text under the comment, and
 * `send_private_message` puts it in the commenter's Messenger inbox instead. Nothing swaps
 * one for the other behind the model's back — a public reply pointing at an inbox that was
 * never written to is the failure mode that keeps the two separate.
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
    /** The comment's platform; the private reply and its wording follow it. */
    platform?: 'facebook' | 'instagram';
    emitSse?: SseEmitter;
    /**
     * Override the Graph reply function (e.g. no-op in test mode). The mirror of
     * `sendMessageOverride` in the Messenger set: a reply that goes nowhere on the wire
     * must not be charged, and without this seam a comment test run would manufacture
     * usage out of nothing.
     */
    replyCommentOverride?: (pageToken: string, targetId: string, text: string) => Promise<string>;
    /**
     * Override the inbox send — the playground's seam, mirroring the one above: it shows the
     * agent choosing the private route without messaging a real person, and a DM that never
     * reaches Meta must not spend a unit of the message allowance.
     */
    sendPrivateMessageOverride?: (pageToken: string, commentId: string, text: string) => Promise<void>;
  },
  onSent?: (text: string, kind: 'public' | 'private') => void,
) {
  /**
   * Claimed before the first await: the model can emit two reply_comment calls
   * in one turn and they run concurrently, so only a check that precedes the
   * Graph POST keeps a duplicated reply off the public thread.
   */
  let replyClaimed = false;
  let privateMessageSent = false;
  const platform = context.platform ?? 'facebook';
  const inbox = platform === 'instagram' ? 'Instagram Direct' : 'Messenger';
  const post = platform === 'instagram' ? 'Instagram post' : 'Facebook post';

  const replyCommentTool = tool(
    async ({ text }) => {
      const violation = publicCommentReplyViolation(text, privateMessageSent, context.customerName);
      if (violation) {
        context.emitSse?.('tool_result', { name: 'reply_comment', result: `Blocked: ${violation}` });
        return `Blocked: ${violation} Provide a safe public answer or end the turn.`;
      }
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
      const postFn =
        context.replyCommentOverride ??
        (platform === 'instagram' ? replyToInstagramComment : replyToFacebookComment);

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

      onSent?.(text, 'public');
      console.log(`[agent-tool] reply_comment done — commentId=${newCommentId}`);
      context.emitSse?.('tool_result', { name: 'reply_comment', result: 'Reply posted to the comment.' });
      return 'Reply posted to the comment.';
    },
    {
      name: 'reply_comment',
      description: `Post a public reply under this customer's ${post} comment. Use for general product questions; do NOT use for prices, stock counts, order details, or em dashes (—).`,
      schema: z.object({
        text: z.string().describe('The exact words to show publicly under the comment'),
      }),
    },
  );

  /**
   * The commenter's own Messenger thread, opened through the comment they just wrote —
   * Meta's only door from a public comment to a private conversation. The answer is recorded
   * on the conversation this commenter would get, so the Messenger agent later knows what
   * this person was already told.
   */
  const sendPrivateMessageTool = tool(
    async ({ text }) => {
      context.emitSse?.('tool_call', { name: 'send_private_message', args: { text } });
      console.log(`[agent-tool] send_private_message called — text="${text}"`);

      if (privateMessageSent) {
        const already = `A private message has already been delivered to this commenter from this comment. Do not send another.`;
        context.emitSse?.('tool_result', { name: 'send_private_message', result: already });
        return `${already} Answer in the comment with reply_comment instead. End the turn.`;
      }

      if (!context.channelId || !context.commenterPlatformId) {
        // No inbox to write into on this thread, so the only honest answer is a public one.
        const refused = 'This commenter cannot be messaged privately. Answer in the comment with reply_comment instead.';
        context.emitSse?.('tool_result', { name: 'send_private_message', result: refused });
        return `${refused} End the turn.`;
      }

      // Charged only now, and only for a send that will really go on the wire — the same
      // rule the Messenger tool follows, so a dry test run cannot manufacture usage.
      const chargeable = !context.sendPrivateMessageOverride && text.trim() !== 'SILENT';
      let chargedPeriod: string | null = null;
      if (chargeable) {
        try {
          const budget = await spendQuotaUnit(context.businessId, 'message');
          if (!budget.spent) {
            const exhausted = `This cycle's ${inbox} messages are used up and the owner has been notified.`;
            context.emitSse?.('tool_result', { name: 'send_private_message', result: exhausted });
            return `${exhausted} Do not try again. End the turn.`;
          }
          chargedPeriod = budget.period;
        } catch (err) {
          // Fails open like every other gate: a database that will not answer must not mute the agent.
          console.error('[agent-tool] message quota spend failed, sending uncharged:', err);
        }
      }

      const cleanText = text.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
      try {
        if (context.sendPrivateMessageOverride) {
          await context.sendPrivateMessageOverride(
            context.pageToken,
            context.parentCommentExternalId,
            cleanText,
          );
        } else {
          await sendCommenterMessage(context.pageToken, context.parentCommentExternalId, cleanText, {
            platform,
          });
        }
        privateMessageSent = true;
      } catch (err) {
        console.error('[agent-tool] send_private_message failed:', err);
        if (chargedPeriod) {
          try {
            await refundQuotaUnit(context.businessId, 'message', chargedPeriod);
          } catch (refundErr) {
            console.error('[agent-tool] message quota refund failed:', refundErr);
          }
        }
        // Told to the model as a fact, not retried: Meta shuts this door for people who
        // have messaging off, and a second attempt costs the cycle without reaching anyone.
        const unreachable = `${inbox} could not be reached for this commenter.`;
        context.emitSse?.('tool_result', { name: 'send_private_message', result: unreachable });
        return `${unreachable} Answer in the comment with reply_comment instead. End the turn.`;
      }

      onSent?.(cleanText, 'private');

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
          sentBy: 'ai',
          content: cleanText,
          state: 'done',
        });
      } catch (err) {
        // The customer already has the message. Bookkeeping that fails must not undo it.
        console.error('[agent-tool] send_private_message could not record the inbox message:', err);
      }

      const sent = `Private message sent to the customer in ${inbox}.`;
      context.emitSse?.('tool_result', { name: 'send_private_message', result: sent });
      console.log(`[agent-tool] send_private_message done`);
      return `Private message sent to this customer’s ${inbox} inbox. Now call reply_comment once with a single courteous line telling them the details are waiting in ${inbox}, without repeating those details publicly. End the turn after that.`;
    },
    {
      name: 'send_private_message',
      description: `Send a private message to this commenter's ${inbox} inbox. Use FIRST for prices, stock counts, shipping or order questions; do NOT use for general public chat.${platform === 'instagram' ? ' Keep it under 1,000 characters: Instagram allows only one private reply per comment.' : ''}`,
      schema: z.object({
        text: z.string().describe('The private answer to deliver in Messenger — the details themselves, in full'),
      }),
    },
  );

  return [
    ...createCatalogTools({
      businessId: context.businessId,
      customerName: context.customerName,
      emitSse: context.emitSse,
    }, { includeOrderTools: false }),
    replyCommentTool,
    sendPrivateMessageTool,
  ];
}
