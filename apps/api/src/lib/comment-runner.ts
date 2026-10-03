import type { TokenUsageMetrics } from '@repo/agent';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { currentContext, outboundRunHeaders, tagContext } from '@api/lib/ctx';
import { agentInputFields, createAgentTrace, tokenFields } from '@api/lib/agent-trace';
import { RUN_LOOP_DEPTH_THRESHOLD, STALE_RUNNER_MS } from '@api/lib/config';

const AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'dev-internal-key';

/**
 * Start a comment agent run in a *new* HTTP invocation (`POST /internal/run-comment`).
 * Only waits for that endpoint to accept (202). The LLM run continues there with
 * its own serverless maxDuration — this caller does not wait for agent.run().
 */
export async function triggerCommentRun(commentThreadId: string): Promise<void> {
  try {
    const res = await fetch(`${AGENT_RUNNER_URL}/internal/run-comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_KEY,
        ...outboundRunHeaders(),
      },
      body: JSON.stringify({ commentThreadId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('Failed to trigger comment run:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('Failed to trigger comment run:', err);
  }
}

const COMMENT_REPLY_GUIDANCE = [
  'You are replying to a public comment on the business’s social media post. The history shows this commenter’s prior comments and prior page replies on the same post.',
  'History may include replies posted by a human page admin from the dashboard as well as your own automated replies. Those are already-sent page messages — do not repeat them.',
  'Only reply if THIS comment is directed at the page/business — a question, a request, or an @mention of the page. If the commenter is talking to another user (user-to-user conversation), do NOT call reply_comment; stay silent.',
  'A NEW customer comment that is directed at the page still needs a reply even if the page already replied earlier in this thread.',
  'If you decide to stay silent, do NOT call any tools and output exactly the word "SILENT" as your final response.',
  'When you should reply, use reply_comment to post a single, short, public-appropriate reply to this one comment.',
].join('\n');

async function resolveGraphReplyTargetId(
  comment: { externalId: string | null; parentExternalId: string | null },
  postId: string,
): Promise<string> {
  const selfId = comment.externalId;
  if (!selfId) throw new Error('Pending comment is missing externalId');
  const parent = comment.parentExternalId;
  if (!parent || parent === postId) return selfId;

  const { findCommentByExternalId } = await import('@repo/db/crud/comment');
  let cursor: string | null = parent;
  let guard = 0;
  while (cursor && cursor !== postId && guard++ < 8) {
    const row: { externalId: string | null; parentExternalId: string | null } | undefined =
      await findCommentByExternalId(cursor);
    if (!row?.parentExternalId || row.parentExternalId === postId) {
      return row?.externalId ?? cursor;
    }
    cursor = row.parentExternalId;
  }
  return parent;
}

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
    createComment,
  } = await import('@repo/db/crud/comment');
  const { Agent } = await import('@repo/agent');
  const { createCommentAgentTools } = await import('@agent/tools/comment');
  const { listProducts } = await import('@repo/db/crud/product');
  const { getFacebookPostContext, replyToFacebookComment } = await import('@repo/integrations/facebook');

  const trace = createAgentTrace();
  const started = performance.now();
  let ok = true;
  let replyText = '';
  let metrics: TokenUsageMetrics | undefined;
  let sentViaFallback = 0;
  let clearedCount = 0;
  let replyPreexisting = false;
  let handledExternalId: string | null | undefined;
  let stateSetTo = 'working';
  let runError: unknown;

  const thread = await getCommentThreadWithChannel(commentThreadId);
  if (!thread?.channel?.agent) {
    emitAnomaly('channel_without_agent', { detail: commentThreadId });
    return;
  }

  const claimed = await claimCommentThreadForRun(
    thread.id,
    new Date(Date.now() - STALE_RUNNER_MS),
  );
  if (!claimed) {
    // Another runner holds this thread: nothing was replied to here, and the
    // pending comments wait for whoever won the claim.
    emitAnomaly('claim_lost');
    return;
  }

  tagContext({ commentThreadId: thread.id, businessId: thread.businessId, channelId: thread.channelId });
  const runDepth = currentContext()?.runDepth ?? 0;
  if (runDepth >= RUN_LOOP_DEPTH_THRESHOLD) {
    emitAnomaly('run_loop_depth', { count: runDepth });
  }

  const sentCommentTexts: string[] = [];
  let current: Awaited<ReturnType<typeof getOldestPendingComment>> = null;

  try {
    current = await getOldestPendingComment(thread.id);
    if (!current) {
      return;
    }
    handledExternalId = current.externalId;

    const { db } = await import('@repo/db/client');
    const { comments: commentsSchema } = await import('@repo/db/schema');
    const { and, eq, isNull } = await import('drizzle-orm');

    const existingReply = await db.query.comments.findFirst({
      where: and(
        eq(commentsSchema.commentThreadId, thread.id),
        eq(commentsSchema.from, 'self'),
        eq(commentsSchema.parentExternalId, current.externalId!),
        isNull(commentsSchema.deletedAt),
      ),
    });

    if (existingReply) {
      console.log(`[comment-runner] Idempotency catch: Comment ${current.externalId} already has a reply (${existingReply.externalId}). Marking comment done and skipping.`);
      emitAnomaly('duplicate_reply_prevented', { detail: current.externalId ?? undefined });
      await markCommentDone(current.id);
      clearedCount = 1;
      replyPreexisting = true;
      current = null;
      return;
    }

    let postContext = thread.postContext;
    if (!postContext) {
      const fetched = await getFacebookPostContext(thread.channel.apiToken, thread.platformItemId);
      if (fetched) {
        postContext = fetched;
        await setCommentThreadPostContext(thread.id, fetched);
      }
    }

    const doneHistory = await listDoneCommentHistory(thread.id);
    const history = [
      ...doneHistory.map((c) => ({ from: c.from, content: c.content })),
      { from: 'customer' as const, content: current.content },
    ];

    const catalog = await listProducts(thread.businessId, { limit: 10 });
    const catalogSummary = catalog.products
      .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
      .join('\n');

    const systemPrompt = postContext
      ? `Post being commented on:\n${postContext}\n\n${thread.channel.agent.systemPrompt}`
      : thread.channel.agent.systemPrompt;

    emit('agent_input', agentInputFields({ history, catalogCount: catalog.products.length, systemPrompt }));

    const graphReplyToId = await resolveGraphReplyTargetId(current, thread.platformItemId);
    const tools = createCommentAgentTools(
      {
        businessId: thread.businessId,
        commentThreadId: thread.id,
        pageToken: thread.channel.apiToken,
        parentCommentExternalId: current.externalId!,
        graphReplyToId,
        customerName: thread.commenterName,
        emitSse: trace.emitSse,
      },
      (text) => sentCommentTexts.push(text),
    );

    const agent = new Agent({
      systemPrompt,
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
      const run = await agent.run();
      replyText = run.replyText;
      metrics = run.metrics;

      // Log token metrics for this comment thread turn
      try {
        const { recordTokenUsage } = await import('@repo/db/crud/token-analytics');
        await recordTokenUsage({
          businessId: thread.businessId,
          channelId: thread.channelId,
          commentThreadId: thread.id,
          integrationType: 'facebook_comment',
          provider: metrics.provider,
          model: metrics.model,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          totalTokens: metrics.totalTokens,
          cacheHitTokens: metrics.cacheHitTokens,
          cacheMissTokens: metrics.cacheMissTokens,
          cacheHitPercent: metrics.cacheHitPercent,
          latencyMs: metrics.latencyMs,
          estimatedCostUsd: metrics.estimatedCostUsd,
        });
      } catch (metricErr) {
        console.error('[comment-runner] failed to record token metrics:', metricErr);
        // The reply was still posted; only the usage row is missing, so the turn
        // never counts against the plan.
        emitAnomaly('token_metrics_unrecorded', { detail: metricErr });
        emit('error', errorFields(metricErr), { dedupe: null });
      }

      if (sentCommentTexts.length === 0 && replyText && replyText.trim() !== 'SILENT') {
        console.log(`[comment-runner] fallback: agent did not call reply_comment, sending final reply directly`);

        const existingFallbackReply = await db.query.comments.findFirst({
          where: and(
            eq(commentsSchema.commentThreadId, thread.id),
            eq(commentsSchema.from, 'self'),
            eq(commentsSchema.parentExternalId, current.externalId!),
            isNull(commentsSchema.deletedAt),
          ),
        });

        if (!existingFallbackReply) {
          const newCommentId = await replyToFacebookComment(
            thread.channel.apiToken,
            graphReplyToId,
            replyText,
          );
          await createComment({
            commentThreadId: thread.id,
            from: 'self',
            content: replyText,
            externalId: newCommentId,
            parentExternalId: current.externalId!,
            state: 'done',
          });
          sentViaFallback = 1;
        } else {
          console.log(`[comment-runner] fallback skipped: already replied to comment ${current.externalId}`);
          emitAnomaly('duplicate_reply_prevented', { detail: current.externalId ?? undefined });
          replyPreexisting = true;
        }
      }
    } catch (err) {
      console.error('Comment agent run failed:', err);
      ok = false;
      runError = err;
      emit('error', errorFields(err), { dedupe: null });
    }

    await markCommentDone(current.id);
    clearedCount = 1;
    current = null;
  } catch (err) {
    console.error('Comment agent run failed:', err);
    ok = false;
    runError = err;
    emit('error', errorFields(err), { dedupe: null });
    if (current) {
      try {
        await markCommentDone(current.id);
        clearedCount = 1;
      } catch (markErr) {
        console.error('Failed to mark comment done after runner error:', markErr);
        // The comment stays pending, so it is retried — but the thread state
        // below still goes to `done`.
        emit('error', errorFields(markErr), { dedupe: null });
      }
      current = null;
    }
  } finally {
    await updateCommentThreadState(thread.id, 'done');
    stateSetTo = 'done';

    const sentViaTool = sentCommentTexts.length;
    const unresolved = trace.unresolved();
    if (unresolved) {
      // A tool that reported a call but no result threw inside it — for
      // reply_comment that is the Graph post or the history write failing.
      emitAnomaly('tool_call_unresolved', { detail: unresolved });
    }
    if (sentViaTool > 0 && sentViaFallback > 0) {
      emitAnomaly('double_send');
    }
    if (runError && stateSetTo === 'done') {
      // The thread is released as `done` whether or not the run broke, so only
      // the log records that this comment was never answered properly. The
      // exception itself is on this invocation's `evt=error`.
      emitAnomaly('error_state_done');
    }
    if (
      ok &&
      clearedCount > 0 &&
      !replyPreexisting &&
      replyText.trim() !== 'SILENT' &&
      sentViaTool + sentViaFallback === 0
    ) {
      // The comment was retired with no page reply and no decision to stay
      // silent: a customer who asked and will never be answered. Which comment
      // this was, and what the agent said instead, is on the run's own event.
      emitAnomaly('comment_unanswered');
    }

    const hasPending = await checkPendingComments(thread.id);
    emit('agent_run', {
      ok,
      pendingClaimed: handledExternalId !== undefined ? 1 : 0,
      repliedCount: clearedCount,
      sentViaTool,
      sentViaFallback,
      fallbackUsed: sentViaFallback > 0,
      stateSetTo,
      toolCallCount: trace.toolCallCount(),
      externalId: handledExternalId ?? undefined,
      replyText,
      ...tokenFields(metrics),
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      reTriggered: hasPending,
    });

    if (hasPending) {
      await triggerCommentRun(commentThreadId);
    }
  }
}
