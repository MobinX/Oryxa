import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createCatalogTools } from '@agent/tools';
import { createComment } from '@repo/db/crud/comment';
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
    customerName?: string | null;
    emitSse?: SseEmitter;
  },
  onSent?: (text: string) => void,
) {
  const replyCommentTool = tool(
    async ({ text }) => {
      context.emitSse?.('tool_call', { name: 'reply_comment', args: { text } });
      console.log(`[agent-tool] reply_comment called — text="${text}"`);

      const newCommentId = await replyToFacebookComment(
        context.pageToken,
        context.parentCommentExternalId,
        text,
      );
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
