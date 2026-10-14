import { COMMENT_REPLY_GUIDANCE, type SseEmitter } from '@repo/agent';
import { agentInputFields, createAgentTrace } from '@api/lib/agent-trace';
import { emit } from '@api/lib/log';

/** A comment thread the playground can drive: the new comment, who wrote it, and what came before. */
export type CommentTestInput = {
  businessId: string;
  channelId: string;
  /** The new public comment the agent is asked to handle. */
  comment: string;
  /**
   * Stable per playground session, so a second run continues the same thread instead of
   * opening a new one — the way a commenter replying under their own comment would.
   */
  commenterPlatformId: string;
  commenterName?: string;
  postId: string;
  history?: { from: 'customer' | 'self'; content: string }[];
};

/**
 * Runs the comment agent over a made-up thread and streams what it decided.
 *
 * Deliberately a separate path from `runAgentForCommentThread`: a playground run must never
 * post to a real Page, never spend the owner's allowance, and never leave a comment pending
 * for the live runner to answer again. So both Graph calls are replaced by SSE events, no
 * quota is touched, and the seeded comment is retired at the end whether or not it was
 * answered — which is also what makes the silence observable instead of a half-run.
 */
export async function runCommentTest(input: CommentTestInput, forward?: SseEmitter): Promise<void> {
  const {
    getOrCreateCommentThread,
    getCommentThreadWithChannel,
    createComment,
    listDoneCommentHistory,
    markCommentDone,
    updateCommentThreadState,
  } = await import('@repo/db/crud/comment');
  const { buildCatalogSummary } = await import('./catalog-summary');
  const { Agent } = await import('@repo/agent');
  const { createCommentAgentTools } = await import('@agent/tools/comment');
  const { resolveAnsweringAgent } = await import('@repo/db/crud/default-agent');

  const trace = createAgentTrace(forward);
  const emitSse = trace.emitSse;

  const thread = await getOrCreateCommentThread(
    input.businessId,
    input.channelId,
    input.postId,
    input.commenterPlatformId,
    input.commenterName ?? 'Playground Commenter',
  );

  // Earlier lines are written as already-answered, which is precisely what the live runner
  // reads as history — so a tweaked prompt is tested against a thread that looks real to the
  // agent rather than against a special-case input shape.
  for (const row of input.history ?? []) {
    await createComment({
      commentThreadId: thread.id,
      from: row.from,
      content: row.content,
      externalId: `test-history-${crypto.randomUUID().slice(0, 8)}`,
      parentExternalId: 'test-history-root',
      state: 'done',
    });
  }

  const current = await createComment({
    commentThreadId: thread.id,
    from: 'customer',
    content: input.comment,
    externalId: `test-comment-${crypto.randomUUID().slice(0, 8)}`,
    parentExternalId: input.postId,
    state: 'pending',
  });

  emitSse('thread_ready', {
    commentThreadId: thread.id,
    postId: input.postId,
    commenterPlatformId: input.commenterPlatformId,
  });

  const full = await getCommentThreadWithChannel(thread.id);
  if (!full?.channel?.agent) {
    emitSse('error', { message: 'This channel has no agent assigned — link one in the dashboard first' });
    await markCommentDone(current.id);
    return;
  }

  const doneHistory = await listDoneCommentHistory(thread.id);
  const history = [
    ...doneHistory.map((c) => ({ from: c.from, content: c.content })),
    { from: 'customer' as const, content: input.comment },
  ];

  // A comment thread has no card tools, so the catalog block must not send it to show_products.
  const catalog = await buildCatalogSummary(input.businessId, { canShowCards: false });
  const catalogSummary = catalog.summary;

  const answering = await resolveAnsweringAgent(full.channel.agent);
  const systemPrompt = full.postContext
    ? `Post being commented on:\n${full.postContext}\n\n${answering.systemPrompt}`
    : answering.systemPrompt;

  emit('agent_input', agentInputFields({ history, catalogCount: catalog.total, systemPrompt }));

  let delivered = false;
  const tools = createCommentAgentTools(
    {
      businessId: input.businessId,
      commentThreadId: thread.id,
      pageToken: full.channel.apiToken,
      parentCommentExternalId: current.externalId!,
      graphReplyToId: current.externalId!,
      customerName: input.commenterName ?? null,
      channelId: input.channelId,
      commenterPlatformId: input.commenterPlatformId,
      emitSse,
      // Nothing reaches the wire but this stream: the playground's whole point is to see
      // which door the agent chose without a real person being posted at. An override also
      // means "not chargeable", which is how the tools already treat a dry run.
      replyCommentOverride: async (_token, _target, text) => {
        delivered = true;
        emitSse('comment_replied', { text });
        return `test-reply-${crypto.randomUUID().slice(0, 8)}`;
      },
      sendPrivateMessageOverride: async (_token, _commentId, text) => {
        delivered = true;
        emitSse('private_message_sent', { text });
      },
    },
    () => undefined,
  );

  const agent = new Agent({
    systemPrompt,
    business: full.business ?? { id: input.businessId, name: 'Store' },
    history,
    conversationId: thread.id,
    pageToken: full.channel.apiToken,
    customerPlatformId: input.commenterPlatformId,
    customerName: input.commenterName ?? null,
    catalogSummary,
    tools,
    replyGuidance: answering.commentReplyGuidance || COMMENT_REPLY_GUIDANCE,
    emitSse,
  });

  let replyText = '';
  try {
    const run = await agent.run();
    replyText = run.replyText;
  } catch (err) {
    emitSse('error', { message: String(err) });
  } finally {
    await markCommentDone(current.id);
    await updateCommentThreadState(thread.id, 'done');
  }

  if (!delivered) emitSse('no_reply', { text: replyText, silent: replyText.trim() === 'SILENT' });
}
