import { Hono } from 'hono';
import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage, setConversationProfileIfMissing, resetStaleConversation, checkPendingMessages } from '@repo/db/crud/conversation';
import { processInboundComment, setCommentThreadProfileIfMissing, resetStaleCommentThread, checkPendingComments } from '@repo/db/crud/comment';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { triggerCommentRun } from '@api/lib/comment-runner';
import { runInBackground } from '@api/lib/background';
import { verifyWebhookSignature, getFacebookUserProfile } from '@repo/integrations/facebook';
import { STALE_RUNNER_MS } from '@api/lib/config';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { tagContext } from '@api/lib/ctx';

/** The webhook's own narration, on stdout, next to the event stream. */
function fbLog(message: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`[fb-webhook] ${message}`);
    return;
  }
  console.log(`[fb-webhook] ${message}`, data);
}

type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; mid?: string; is_echo?: boolean };
  postback?: { title?: string; payload?: string; mid?: string };
};

function inboundTextFromMessagingEvent(
  ev: MessagingEvent,
): { senderId: string; text: string; externalId?: string } | null {
  if (ev.message?.is_echo) return null;
  const senderId = ev.sender?.id;
  if (!senderId) return null;

  if (ev.message?.text) {
    return { senderId, text: ev.message.text, externalId: ev.message.mid };
  }

  const payload = ev.postback?.payload;
  if (payload) {
    return {
      senderId,
      text: ev.postback?.title ?? payload,
      externalId: ev.postback?.mid,
    };
  }

  return null;
}

type CommentChangeValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  /** Meta sends a string post/comment id, not `{ id }`. */
  parent_id?: string | { id?: string };
  message?: string;
  from?: { id?: string; name?: string };
  post_id?: string;
};

function facebookParentCommentId(
  parentId: CommentChangeValue['parent_id'],
  postId: string | undefined,
): string | undefined {
  if (!parentId) return undefined;
  const raw = typeof parentId === 'string' ? parentId : parentId.id;
  if (!raw) return undefined;
  // Top-level comments have parent_id === post_id; that is not a parent comment.
  if (postId && raw === postId) return undefined;
  return raw;
}

type WebhookChange = {
  field?: string;
  value?: CommentChangeValue;
};

type WebhookEntry = {
  id: string;
  messaging?: MessagingEvent[];
  changes?: WebhookChange[];
};

type WebhookBody = {
  object: string;
  entry?: WebhookEntry[];
};

/**
 * A lock untouched since this instant is orphaned rather than slow: the process
 * that took it is gone, and nothing will ever release it. Passing the instant to
 * the reset keeps that judgement inside the statement that acts on it, so a
 * recovery can never hand a live run's conversation to a second runner.
 */
function staleBefore(): Date {
  return new Date(Date.now() - STALE_RUNNER_MS);
}

/** How long the state the inbound write found had already been sitting. */
function stateAgeMs(stateAt: Date): number {
  return Date.now() - stateAt.getTime();
}

async function handleTestingForward(c: any, method: 'GET' | 'POST'): Promise<Response | null> {
  if (process.env.TESTING !== 'true') {
    fbLog('[TESTING] Testing mode not enabled');
    return null;
  }

  const targetUrl = 'https://api.oryxa.us/webhooks/facebook';
  const queryStr = c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : '';
  const forwardUrl = `${targetUrl}${queryStr}`;

  // The forwarded query carries hub.verify_token, so the URL is never logged.
  emit('webhook', { event: 'testing_forward' });
  fbLog(`[TESTING] Forwarding webhook ${method} request to: ${targetUrl}`);

  if (method === 'GET') {
    try {
      const res = await fetch(forwardUrl);
      const text = await res.text();
      return c.text(text, res.status as any);
    } catch (err) {
      console.error('[TESTING] Failed to forward GET verification:', err);
      emit('error', errorFields(err), { dedupe: null });
      return c.text('Error forwarding', 500);
    }
  }

  // POST request: read text, copy all non-host headers, and execute async fetch
  const rawBody = await c.req.text();
  const headers: Record<string, string> = {};
  Object.entries(c.req.header()).forEach(([key, value]) => {
    if (key.toLowerCase() !== 'host') {
      headers[key] = value;
    }
  });

  fetch(forwardUrl, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch((err) => {
    console.error('[TESTING] Failed to forward POST webhook in background:', err);
    emit('error', errorFields(err), { dedupe: null });
  });

  fbLog('[TESTING] Forwarded POST asynchronously (fire and forget) — acknowledging 200 OK');
  return c.text('EVENT_RECEIVED', 200);
}

export const fbWebhookRouter = new Hono();
fbWebhookRouter.get('/facebook', async (c) => {
  const forwardRes = await handleTestingForward(c, 'GET');
  if (forwardRes) return forwardRes;

  const url = new URL(c.req.url);
  const mode = c.req.query('hub.mode') ?? url.searchParams.get('hub.mode');
  const token = c.req.query('hub.verify_token') ?? url.searchParams.get('hub.verify_token');
  const challenge = c.req.query('hub.challenge') ?? url.searchParams.get('hub.challenge');
  const verified = mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN;

  // One fact: whether this subscription handshake succeeded. The rejected case is
  // how a page silently stops delivering events — no error, no customer replies.
  emit('webhook', { event: 'verify', mode, verified, hasChallenge: Boolean(challenge) });

  fbLog('GET /facebook', {
    url: c.req.url.split('?')[0],
    mode,
    verifyTokenMatch: verified,
    hasChallenge: Boolean(challenge),
    challengeLength: challenge?.length ?? 0,
  });

  if (verified) {
    fbLog('GET /facebook verify OK — returning challenge');
    return c.text(challenge ?? '');
  }

  fbLog('GET /facebook verify rejected', { mode, verifyTokenMatch: false });
  return c.text('Forbidden', 403);
});

/**
 * The one event a delivery produces. Customer text, raw bodies and signature
 * values never enter it — Meta signs the raw bytes, so the body is read as text
 * only to verify and parse, then dropped.
 */
function deliveryEventFields(body: WebhookBody, signatureValid: boolean) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  return {
    event: 'delivery',
    object: body.object,
    signatureValid,
    pageId: entries[0]?.id,
    entryCount: entries.length,
    messagingCount: entries.reduce((n, e) => n + (e.messaging?.length ?? 0), 0),
    changesCount: entries.reduce((n, e) => n + (e.changes?.length ?? 0), 0),
  };
}

fbWebhookRouter.post('/facebook', async (c) => {
  const forwardRes = await handleTestingForward(c, 'POST');
  if (forwardRes) return forwardRes;

  const signature256 = c.req.header('x-hub-signature-256');
  const signature = c.req.header('x-hub-signature');

  fbLog('POST /facebook received', {
    'x-hub-signature-256': signature256 ?? null,
    'x-hub-signature': signature ?? null,
    contentType: c.req.header('content-type') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });

  const raw = await c.req.text();
  fbLog('POST /facebook raw body', raw);

  const signatureValid = await verifyWebhookSignature(raw, signature256 ?? signature);
  fbLog('POST /facebook signature verification', { valid: signatureValid });

  if (!signatureValid) {
    fbLog('POST /facebook rejected — invalid signature but will go through still');
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch (err) {
    fbLog('POST /facebook rejected — malformed JSON', err);
    emit('webhook', { event: 'delivery', signatureValid });
    return c.text('Malformed JSON', 400);
  }

  fbLog('POST /facebook parsed body', body);

  if (body.object !== 'page' || !Array.isArray(body.entry)) {
    fbLog('POST /facebook rejected — unhandled shape', {
      object: body.object,
      entryIsArray: Array.isArray(body.entry),
    });
    emit('webhook', deliveryEventFields(body, signatureValid));
    return c.text('Unhandled or malformed webhook', 400);
  }

  // An invalid signature is recorded and still accepted: anyone holding this URL
  // can POST a forged page event. Enforcement waits until the failure rate on
  // real Meta traffic has been measured, so a config mistake cannot drop events.
  emit('webhook', deliveryEventFields(body, signatureValid));

  fbLog('POST /facebook ack — processing entries', {
    entryCount: body.entry.length,
    pageIds: body.entry.map((e) => e.id),
    vercelInline: Boolean(process.env.VERCEL),
  });

  const work = processEntries(body.entry).catch((err) => {
    console.error('[fb-webhook] background processing failed', err);
  });

  // Hono's Vercel adapter does not provide executionCtx.waitUntil, so background
  // work was being killed as soon as the 200 ack returned. On Vercel, process
  // inline (Meta allows ~20s). Elsewhere, ack fast and finish in background.
  if (process.env.VERCEL) {
    await work.catch((err) => emit('error', errorFields(err), { dedupe: null }));
  } else {
    runInBackground(c, work, 'fb-webhook');
  }

  return c.text('EVENT_RECEIVED', 200);
});

/**
 * Processes every entry in a batched webhook payload. A single page can deliver
 * either Messenger `messaging` events (DMs) or `changes` events (page feed,
 * including comments) — both are handled here, with the channel looked up once
 * per page.
 */
async function processEntries(entries: WebhookEntry[]): Promise<void> {
  fbLog('processEntries start', { entryCount: entries.length });

  for (const entry of entries) {
    const messaging = entry.messaging ?? [];
    const changes = entry.changes ?? [];

    fbLog('processEntries entry', {
      pageId: entry.id,
      messagingCount: messaging.length,
      changesCount: changes.length,
      messaging: entry.messaging,
      changes: entry.changes,
    });

    if (messaging.length === 0 && changes.length === 0) {
      fbLog('processEntries skip entry — no messaging or changes', { pageId: entry.id });
      continue;
    }

    const channel = await getChannelByPageId(entry.id);
    if (!channel) {
      // Every event for this page is dropped behind a 200 ack: a disconnected
      // channel is indistinguishable from a quiet one until this says so.
      fbLog('processEntries skip entry — unknown page (no channel)', { pageId: entry.id });
      emitAnomaly('webhook_unknown_page', { detail: entry.id });
      continue;
    }

    fbLog('processEntries channel resolved', {
      pageId: entry.id,
      channelId: channel.id,
      businessId: channel.businessId,
      agentId: channel.agentId ?? null,
    });

    // Stamped onto every later event of this invocation instead of repeated on
    // each one; deliveries carry a single page in practice.
    tagContext({ channelId: channel.id, businessId: channel.businessId });

    if (messaging.length > 0) {
      await processMessagingEvents(channel, messaging);
    }
    if (changes.length > 0) {
      await processCommentChanges(channel, entry.id, changes);
    }
  }

  fbLog('processEntries done');
}

/** Messenger DM events: dedup on mid, skip echoes + non-text/postback, trigger agent, enrich profile. */
async function processMessagingEvents(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  events: MessagingEvent[],
): Promise<void> {
  fbLog('processMessagingEvents start', { channelId: channel.id, eventCount: events.length });

  for (const [index, ev] of events.entries()) {
    fbLog('processMessagingEvents event', { index, event: ev });

    const inbound = inboundTextFromMessagingEvent(ev);
    if (!inbound) {
      // An echo or a read receipt is not a customer, so it stays silent. A real
      // message with no text (attachment, sticker, audio) is a customer who will
      // not be answered, and that is the only skipped case worth an event.
      fbLog('processMessagingEvents skip event — not actionable text/postback', {
        index,
        isEcho: ev.message?.is_echo ?? false,
        hasText: Boolean(ev.message?.text),
        hasPostback: Boolean(ev.postback?.payload),
        senderId: ev.sender?.id ?? null,
      });
      if (ev.message && !ev.message.is_echo && !ev.message.text) {
        emit('webhook_item', { kind: 'message', externalId: ev.message.mid, outcome: 'unsupported_content' });
      }
      continue;
    }

    const { senderId, text, externalId } = inbound;
    fbLog('processMessagingEvents inbound', { index, senderId, text, externalId: externalId ?? null });

    const { conversationId, priorStatus, inserted, needsProfile, priorStateAt } =
      await processInboundMessage(
        { id: channel.id, businessId: channel.businessId },
        senderId,
        text,
        externalId,
      );

    fbLog('processMessagingEvents persisted', {
      index,
      conversationId,
      priorStatus,
      inserted,
      needsProfile,
    });

    if (inserted && needsProfile) {
      fbLog('processMessagingEvents enriching profile', { index, conversationId, senderId });
      const profile = await getFacebookUserProfile(channel.apiToken, senderId);
      fbLog('processMessagingEvents profile result', { index, conversationId, profile });
      await setConversationProfileIfMissing(conversationId, profile);
    }

    // An in-flight conversation is one whose runner may still be alive — or may
    // have died and left the lock behind. Both cases answer to the same test, so
    // they share the same recovery call rather than two copies of it.
    const inFlight = priorStatus === 'working' || priorStatus === 'pending';
    let outcome: string;
    let ageMs: number | undefined;

    if (!inserted) {
      // Meta re-delivers the same mid because it never saw an answer. That is
      // precisely when the run it waited on is most likely to have died, so the
      // redelivery is treated as a recovery signal too — but only for a lock that
      // has genuinely gone stale, never for the duplicate of a live delivery.
      outcome = 'redelivered';
      fbLog('processMessagingEvents redelivered mid — already stored', { index, conversationId, priorStatus });
      if (channel.agentId && inFlight) {
        ageMs = stateAgeMs(priorStateAt);
        const stale = ageMs > STALE_RUNNER_MS;
        fbLog('processMessagingEvents redelivery stale check', {
          index,
          conversationId,
          priorStatus,
          ageMs,
          staleThresholdMs: STALE_RUNNER_MS,
          isStale: stale,
        });
        if (stale) {
          fbLog('processMessagingEvents recovering stale runner', { index, conversationId, ageMs });
          if (await resetStaleConversation(conversationId, staleBefore())) {
            fbLog('processMessagingEvents stale reset succeeded — re-triggering agent', { index, conversationId });
            await triggerAgentRun(conversationId);
            outcome = 'redelivered_stale_recovered';
          } else {
            fbLog('processMessagingEvents stale reset lost race — another caller recovered', { index, conversationId });
          }
        } else {
          fbLog('processMessagingEvents runner still fresh — no extra trigger needed', { index, conversationId, ageMs });
        }
      } else if (channel.agentId && (await checkPendingMessages(conversationId))) {
        // The delivery that stored this message committed the row and then died
        // before it could run — which is exactly why Meta is redelivering it.
        // Nothing is in flight, so this copy runs the reply instead of ending
        // the conversation unanswered.
        fbLog('processMessagingEvents redelivery found an unanswered backlog — triggering agent', {
          index,
          conversationId,
          priorStatus,
        });
        await triggerAgentRun(conversationId);
        outcome = 'redelivered_pending_drained';
      }
    } else if (priorStatus === 'done' && channel.agentId) {
      fbLog('processMessagingEvents triggering agent', { index, conversationId, agentId: channel.agentId });
      await triggerAgentRun(conversationId);
      outcome = 'agent_triggered';
    } else if (inFlight && channel.agentId) {
      ageMs = stateAgeMs(priorStateAt);
      const stale = ageMs > STALE_RUNNER_MS;
      fbLog('processMessagingEvents stale check', {
        index,
        conversationId,
        priorStatus,
        ageMs,
        staleThresholdMs: STALE_RUNNER_MS,
        isStale: stale,
      });
      if (stale) {
        // Prior execution is presumed dead. Reset the lock and fire a fresh run
        // so the new message (and any others that piled up) get processed.
        fbLog('processMessagingEvents recovering stale runner', { index, conversationId, ageMs });
        if (await resetStaleConversation(conversationId, staleBefore())) {
          fbLog('processMessagingEvents stale reset succeeded — re-triggering agent', { index, conversationId });
          await triggerAgentRun(conversationId);
          outcome = 'stale_runner_recovered';
        } else {
          fbLog('processMessagingEvents stale reset lost race — another caller recovered', { index, conversationId });
          outcome = 'waited_for_live_runner';
        }
      } else {
        fbLog('processMessagingEvents runner still fresh — no extra trigger needed', { index, conversationId, ageMs });
        outcome = 'waited_for_live_runner';
      }
    } else if (!channel.agentId) {
      // A customer answered by nobody: the channel has no agent attached. The
      // runner names the same invariant from its side when a run is attempted.
      outcome = 'no_agent';
      fbLog('processMessagingEvents no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    } else {
      outcome = 'not_triggered';
      fbLog('processMessagingEvents no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    }

    emit('webhook_item', {
      kind: 'message',
      externalId,
      inserted,
      priorStatus,
      outcome,
      ageMs,
    });
  }

  fbLog('processMessagingEvents done', { channelId: channel.id });
}

/**
 * Facebook Page feed changes: filter to newly-added comments, skip the page's
 * own comments (echo equivalent), and route each to its (post, commenter)
 * thread. Each thread is independent → different commenters run in parallel;
 * within a thread the runner processes comments one at a time.
 */
async function processCommentChanges(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  pageId: string,
  changes: WebhookChange[],
): Promise<void> {
  fbLog('processCommentChanges start', { channelId: channel.id, pageId, changeCount: changes.length });

  for (const [index, change] of changes.entries()) {
    fbLog('processCommentChanges change', { index, change });

    if (change.field !== 'feed') {
      fbLog('processCommentChanges skip — not feed field', { index, field: change.field ?? null });
      continue;
    }

    const value = change.value;
    if (value?.item !== 'comment' || value.verb !== 'add') {
      fbLog('processCommentChanges skip — not new comment', {
        index,
        item: value?.item ?? null,
        verb: value?.verb ?? null,
      });
      continue;
    }

    const commentId = value.comment_id;
    const text = value.message;
    const fromId = value.from?.id;
    const parentId = facebookParentCommentId(value.parent_id, value.post_id);

    if (!commentId || !text || !fromId) {
      // A new comment we cannot route. If Meta changes the shape, or a comment
      // arrives with only an attachment, this is the only trace of it.
      fbLog('processCommentChanges skip — missing comment fields', {
        index,
        commentId: commentId ?? null,
        hasText: Boolean(text),
        fromId: fromId ?? null,
      });
      emit('webhook_item', {
        kind: 'comment',
        commentId,
        parentId,
        verb: value.verb,
        outcome: 'incomplete_payload',
      });
      continue;
    }

    if (fromId === pageId) {
      fbLog('processCommentChanges skip — page own comment (echo)', { index, commentId, fromId });
      continue; // the page's own comment — an echo, not a customer
    }

    fbLog('processCommentChanges inbound comment', {
      index,
      commentId,
      fromId,
      fromName: value.from?.name ?? null,
      postId: value.post_id ?? null,
      text,
    });

    const { threadId, priorStatus, inserted, needsProfile, priorStateAt } =
      await processInboundComment(
        { id: channel.id, businessId: channel.businessId },
        fromId,
        value.from?.name,
        value.post_id ?? '',
        text,
        commentId,
        parentId,
      );

    fbLog('processCommentChanges persisted', {
      index,
      threadId,
      priorStatus,
      inserted,
      needsProfile,
    });

    if (inserted && needsProfile) {
      fbLog('processCommentChanges enriching avatar', { index, threadId, fromId });
      const profile = await getFacebookUserProfile(channel.apiToken, fromId);
      fbLog('processCommentChanges profile result', { index, threadId, profile });
      await setCommentThreadProfileIfMissing(threadId, profile);
    }

    const inFlight = priorStatus === 'working' || priorStatus === 'pending';
    let outcome: string;
    let ageMs: number | undefined;

    if (!inserted) {
      // A re-delivered comment id: Meta is still waiting for an answer, so the
      // runner it waited on is a candidate for recovery just as above.
      outcome = 'redelivered';
      fbLog('processCommentChanges redelivered comment — already stored', { index, threadId, priorStatus });
      if (channel.agentId && inFlight) {
        ageMs = stateAgeMs(priorStateAt);
        const stale = ageMs > STALE_RUNNER_MS;
        fbLog('processCommentChanges redelivery stale check', {
          index,
          threadId,
          priorStatus,
          ageMs,
          staleThresholdMs: STALE_RUNNER_MS,
          isStale: stale,
        });
        if (stale) {
          fbLog('processCommentChanges recovering stale runner', { index, threadId, ageMs });
          if (await resetStaleCommentThread(threadId, staleBefore())) {
            fbLog('processCommentChanges stale reset succeeded — re-triggering comment agent', { index, threadId });
            await triggerCommentRun(threadId);
            outcome = 'redelivered_stale_recovered';
          } else {
            fbLog('processCommentChanges stale reset lost race — another caller recovered', { index, threadId });
          }
        } else {
          fbLog('processCommentChanges runner still fresh — no extra trigger needed', { index, threadId, ageMs });
        }
      } else if (channel.agentId && (await checkPendingComments(threadId))) {
        // Same safety net as the messenger path: the delivery that stored this
        // comment died after committing it, so this redelivery runs the reply.
        fbLog('processCommentChanges redelivery found an unanswered backlog — triggering comment agent', {
          index,
          threadId,
          priorStatus,
        });
        await triggerCommentRun(threadId);
        outcome = 'redelivered_pending_drained';
      }
    } else if (priorStatus === 'done' && channel.agentId) {
      fbLog('processCommentChanges triggering comment agent', { index, threadId, agentId: channel.agentId });
      await triggerCommentRun(threadId);
      outcome = 'comment_run_triggered';
    } else if (inFlight && channel.agentId) {
      ageMs = stateAgeMs(priorStateAt);
      const stale = ageMs > STALE_RUNNER_MS;
      fbLog('processCommentChanges stale check', {
        index,
        threadId,
        priorStatus,
        ageMs,
        staleThresholdMs: STALE_RUNNER_MS,
        isStale: stale,
      });
      if (stale) {
        // Prior execution is presumed dead. Reset the lock and fire a fresh run.
        fbLog('processCommentChanges recovering stale runner', { index, threadId, ageMs });
        if (await resetStaleCommentThread(threadId, staleBefore())) {
          fbLog('processCommentChanges stale reset succeeded — re-triggering comment agent', { index, threadId });
          await triggerCommentRun(threadId);
          outcome = 'stale_runner_recovered';
        } else {
          fbLog('processCommentChanges stale reset lost race — another caller recovered', { index, threadId });
          outcome = 'waited_for_live_runner';
        }
      } else {
        fbLog('processCommentChanges runner still fresh — no extra trigger needed', { index, threadId, ageMs });
        outcome = 'waited_for_live_runner';
      }
    } else if (!channel.agentId) {
      outcome = 'no_agent';
      fbLog('processCommentChanges no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    } else {
      outcome = 'not_triggered';
      fbLog('processCommentChanges no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    }

    emit('webhook_item', {
      kind: 'comment',
      commentId,
      parentId,
      verb: value.verb,
      inserted,
      priorStatus,
      outcome,
      ageMs,
    });
  }

  fbLog('processCommentChanges done', { channelId: channel.id });
}
