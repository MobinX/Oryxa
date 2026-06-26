const AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'dev-internal-key';

export function triggerCommentRun(commentThreadId: string): void {
  fetch(`${AGENT_RUNNER_URL}/internal/run-comment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify({ commentThreadId }),
  }).catch((err) => console.error('Failed to trigger comment run:', err));
}

const COMMENT_REPLY_GUIDANCE = [
  'You are replying to a public comment on the business\u2019s social media post. The history shows this commenter\u2019s prior comments and your prior replies on the same post.',
  'Only reply if THIS comment is directed at the page/business \u2014 a question, a request, or an @mention of the page. If the commenter is talking to another user (user-to-user conversation), do NOT call reply_comment; stay silent.',
  'When you should reply, use reply_comment to post a single, short, public-appropriate reply to this one comment.',
].join('\n');

/**
 * Processes ONE comment for a (channel, post, commenter) thread: the oldest
 * pending customer comment from that commenter on that post.
 *
 * Per the product design:
 *  - Different threads (different commenters) run in parallel — each has its
 *    own atomic claim, so they never block each other.
 *  - Within a thread, comments are processed one at a time, oldest first. Each
 *    run loads the prior *done* history (this commenter's earlier comments and
 *    the bot's earlier replies on this post) plus the single comment being
 *    handled — never the still-pending newer comments, so history stays clean.
 *  - The agent decides whether to reply (only if directed at the page). There
 *    is NO fallback send: silence is a valid outcome (user-to-user chatter).
 *  - The handled comment is marked done after exactly one attempt, so a partial
 *    send is never re-sent (no duplicate public replies); other pending
 *    comments in the thread are drained by the tail re-trigger.
 */
export async function runAgentForCommentThread(commentThreadId: string): Promise<void> {
  const {
    getCommentThreadWithChannel,
    claimCommentThreadForRun,
    getOldestPendingComment,
    listDoneCommentHistory,
    markCommentDone,
    updateCommentThreadState,
    checkPendingComments,
    setCommentThreadPostContext,
  } = await import('@repo/db/crud/comment');
  const { Agent } = await import('@repo/agent');
  const { createCommentAgentTools } = await import('@agent/tools/comment');
  const { listProducts } = await import('@repo/db/crud/product');
  const { getFacebookPostContext } = await import('@repo/integrations/facebook');

  const thread = await getCommentThreadWithChannel(commentThreadId);
  if (!thread?.channel?.agent) return;

  const claimed = await claimCommentThreadForRun(thread.id);
  if (!claimed) return;

  const current = await getOldestPendingComment(thread.id);
  if (!current) {
    // Nothing to process (e.g. a concurrent run already drained it). Release.
    await updateCommentThreadState(thread.id, 'done');
    return;
  }

  // Give the agent the context of what post the comment is on. Fetched from the
  // Graph API once, cached on the thread (posts don't change), and injected into
  // the system prompt. Best-effort: if the lookup fails the agent just works
  // off the comment text + history.
  let postContext = thread.postContext;
  if (!postContext) {
    const fetched = await getFacebookPostContext(thread.channel.apiToken, thread.platformItemId);
    if (fetched) {
      postContext = fetched;
      await setCommentThreadPostContext(thread.id, fetched);
    }
  }

  // Clean history: prior *done* back-and-forth with this commenter on this
  // post, plus the single comment being handled. Newer pending comments are
  // excluded so they don't pollute this reply's context.
  const doneHistory = await listDoneCommentHistory(thread.id);
  const history = [
    ...doneHistory.map((c) => ({ from: c.from, content: c.content })),
    { from: 'customer' as const, content: current.content },
  ];

  const catalog = await listProducts(thread.businessId, { limit: 10 });
  const catalogSummary = catalog.products
    .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
    .join('\n');

  const tools = createCommentAgentTools({
    businessId: thread.businessId,
    commentThreadId: thread.id,
    pageToken: thread.channel.apiToken,
    parentCommentExternalId: current.externalId!,
    customerName: thread.commenterName,
  });

  const agent = new Agent({
    systemPrompt: postContext
      ? `Post being commented on:\n${postContext}\n\n${thread.channel.agent.systemPrompt}`
      : thread.channel.agent.systemPrompt,
    business: thread.business ?? { id: thread.businessId, name: 'Store' },
    history,
    conversationId: thread.id,
    pageToken: thread.channel.apiToken,
    customerPlatformId: thread.commenterPlatformId,
    customerName: thread.commenterName,
    catalogSummary,
    tools,
    replyGuidance: COMMENT_REPLY_GUIDANCE,
  });

  try {
    await agent.run();
    // No fallback send: silence is valid (the comment was user-to-user, or the
    // agent judged it not for the page). The reply_comment tool already sent +
    // persisted if the agent chose to reply.
  } catch (err) {
    console.error('Comment agent run failed:', err);
    // Mark this comment done so a partial send is never re-sent on retry (no
    // duplicate public replies). Other pending comments still get drained.
  }

  await markCommentDone(current.id);
  await updateCommentThreadState(thread.id, 'done');

  // Drain the rest of this commenter's queue, one per follow-up run.
  const hasPending = await checkPendingComments(thread.id);
  if (hasPending) {
    triggerCommentRun(commentThreadId);
  }
}
