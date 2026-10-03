import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { agentRunResult } from '../helpers/agent-run';
import { runAgentForConversation } from '@api/lib/agent-runner';
import { flush, __testOnly } from '@api/lib/log';
import { startContext, withContext, type LogContext } from '@api/lib/ctx';
import type { AgentConfig } from '@repo/agent';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  senderAction: vi.fn(async () => undefined),
}));

// The real Agent, with an injected LLM so no provider is called. The tests below
// stub `run` and drive the emitter the runner now always passes, which is the
// wiring being proven here.
vi.mock('@repo/agent', async () => {
  const mod = await import('../../packages/agent/index');
  const { createSendMessageFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({ ...config, llm: config.llm ?? createSendMessageFakeLlm('Automated reply from test agent') });
      }
    },
  };
});

type RunInstance = {
  sentTexts: string[];
  config: { emitSse?: (event: string, data: unknown) => void };
};

type Event = Record<string, unknown>;

/**
 * Runs one agent turn inside an invocation context — the re-trigger chain depth
 * included — and returns every event that left the queue.
 */
async function runAndCapture(conversationId: string, runDepth = 0): Promise<{ events: Event[]; ctx: LogContext }> {
  const batches: Event[][] = [];
  __testOnly.setIngest((events) => {
    batches.push(events);
    return Promise.resolve();
  });
  const ctx = startContext({ runDepth });
  await withContext(ctx, async () => {
    await runAgentForConversation(conversationId);
    await flush();
  });
  return { events: batches.flat(), ctx };
}

const of = (events: Event[], evt: string) => events.filter((e) => e.evt === evt);
const kinds = (events: Event[]) => of(events, 'anomaly').map((a) => a.kind).sort();

describe('agent run outcome logging', () => {
  withPglite();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('axiom');
    sendMessageMock.mockClear();
    // A run that leaves pending work behind re-triggers over HTTP; on this box
    // that is a connection to whatever the developer last ran on port 3001.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('accepted', { status: 202 })));
  });

  afterEach(() => {
    __testOnly.reset();
    vi.unstubAllGlobals();
    for (const key of ['LOG_CONTENT', 'LOG_SINK']) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('states a successful turn once: the input, the tool trace, the outcome', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'is the t-shirt in stock?' });

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: RunInstance) {
      // Production runs used to leave the agent with no emitter at all; the
      // runner now always supplies one, so the tools have somewhere to report.
      expect(typeof this.config.emitSse).toBe('function');
      this.config.emitSse?.('tool_call', { name: 'send_message', args: { text: 'Yes, 10 left.' } });
      this.config.emitSse?.('tool_result', { name: 'send_message', result: 'Message successfully sent' });
      this.sentTexts = ['Yes, 10 left.'];
      return agentRunResult('Yes, 10 left.', ['Yes, 10 left.']);
    });

    const { events } = await runAndCapture(seed.conversation.id);
    runSpy.mockRestore();

    const input = of(events, 'agent_input');
    expect(input).toHaveLength(1);
    expect(input[0]).toMatchObject({ historyLength: 1, catalogCount: 1 });
    expect(String(input[0].turns)).toContain('is the t-shirt in stock?');

    const calls = of(events, 'tool_call');
    const results = of(events, 'tool_result');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tool: 'send_message', args: '{"text":"Yes, 10 left."}' });
    expect(results).toHaveLength(1);
    expect(results[0].toolCallId).toBe(calls[0].toolCallId);

    const runs = of(events, 'agent_run');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      ok: true,
      pendingClaimed: 1,
      repliedCount: 1,
      sentViaTool: 1,
      sentViaFallback: 0,
      fallbackUsed: false,
      stateSetTo: 'done',
      toolCallCount: 1,
      replyText: 'Yes, 10 left.',
      provider: 'test-provider',
      model: 'test-model',
    });
    expect(typeof runs[0].durationMs).toBe('number');
    // The reply is stated once: on the outcome event, never on a second one.
    expect(events.filter((e) => e.replyText !== undefined)).toEqual([runs[0]]);
    expect(kinds(events)).toEqual([]);
  });

  it('reports a backlog cleared without any reply as an anomaly, not a success', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'hello?' });

    const { Agent } = await import('@repo/agent');
    // The agent returns nothing and calls nothing: today that marks every
    // pending message `done` and the customer is never answered again.
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function () {
      return agentRunResult('', []);
    });

    const { events } = await runAndCapture(seed.conversation.id);
    runSpy.mockRestore();

    expect(of(events, 'agent_run')).toMatchObject([
      { ok: true, pendingClaimed: 1, repliedCount: 1, sentViaTool: 0, sentViaFallback: 0 },
    ]);
    expect(kinds(events)).toEqual(['backlog_claimed_but_unanswered']);
    expect(of(events, 'anomaly')[0]).toMatchObject({ count: 1 });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('records a broken run once, including that the state still went to done', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'hello?' });

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: RunInstance) {
      // A tool that throws mid-run reports its call and never its result.
      this.config.emitSse?.('tool_call', { name: 'send_message', args: { text: 'partial' } });
      throw new Error('graph send failed');
    });

    const { events } = await runAndCapture(seed.conversation.id);
    runSpy.mockRestore();

    expect(of(events, 'agent_run')).toMatchObject([
      { ok: false, repliedCount: 0, sentViaTool: 0, stateSetTo: 'done', toolCallCount: 1 },
    ]);
    expect(of(events, 'tool_result')).toHaveLength(0);
    expect(of(events, 'error')).toHaveLength(1);
    expect(of(events, 'error')[0]).toMatchObject({ name: 'Error' });
    expect(String(of(events, 'error')[0].message)).toContain('graph send failed');
    expect(kinds(events)).toEqual(['error_state_done', 'tool_call_unresolved']);
    // The invariant catalogue carries no stack; the one error event does.
    expect(of(events, 'anomaly').every((a) => a.stack === undefined)).toBe(true);
  });

  it('says so when the message lock was already held', async () => {
    const seed = await seedTestWorld();
    const conversationCrud = await import('@repo/db/crud/conversation');
    const claimSpy = vi.spyOn(conversationCrud, 'claimConversationForAgentRun').mockResolvedValue(false);

    const { events } = await runAndCapture(seed.conversation.id);
    claimSpy.mockRestore();

    expect(kinds(events)).toEqual(['claim_lost']);
    // No run happened, so no run outcome — and no request-level facts repeated.
    expect(of(events, 'agent_run')).toHaveLength(0);
    expect(of(events, 'agent_input')).toHaveLength(0);
  });

  it('flags a channel that can never reply as the reason for the silence', async () => {
    const seed = await seedTestWorld();
    const { updateChannelAgent } = await import('@repo/db/crud/channel');
    await updateChannelAgent(seed.channel.id, seed.business.id, null);

    const { events } = await runAndCapture(seed.conversation.id);

    expect(kinds(events)).toEqual(['channel_without_agent']);
    expect(of(events, 'anomaly')[0]).toMatchObject({ detail: seed.conversation.id });
    expect(of(events, 'agent_run')).toHaveLength(0);
  });
});

/**
 * The fallback path and the re-trigger are the two places a turn can quietly
 * double up or stall, and both are stated on the one outcome event.
 */
describe('agent run chain', () => {
  withPglite();

  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('axiom');
  });

  afterEach(() => {
    __testOnly.reset();
  });

  it('marks the fallback reply and never claims a tool send', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'hi' });

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function () {
      return agentRunResult('direct fallback reply', []);
    });

    const { events } = await runAndCapture(seed.conversation.id);
    runSpy.mockRestore();

    expect(of(events, 'agent_run')).toMatchObject([
      { ok: true, sentViaTool: 0, sentViaFallback: 1, fallbackUsed: true, replyText: 'direct fallback reply' },
    ]);
    // Exactly one send, and no double-send invariant tripped.
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(kinds(events)).toEqual([]);
  });

  it('records that a run handed the conversation on, with the depth it ran at', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'hi' });

    const conversationCrud = await import('@repo/db/crud/conversation');
    const pendingSpy = vi.spyOn(conversationCrud, 'checkPendingMessages').mockResolvedValue(true);
    const fetchMock = vi.fn(async () => new Response('accepted', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: RunInstance) {
      this.sentTexts = ['ok'];
      return agentRunResult('ok', ['ok']);
    });

    // A depth-4 chain: one step short of the runaway threshold, so the re-trigger
    // is legitimate and the event must show it.
    const { events, ctx } = await runAndCapture(seed.conversation.id, 4);

    runSpy.mockRestore();
    pendingSpy.mockRestore();
    vi.unstubAllGlobals();

    const run = of(events, 'agent_run')[0];
    expect(run).toMatchObject({ ok: true, reTriggered: true, runDepth: 4 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/internal/run'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-run-id': ctx.runId, 'x-run-depth': '5' }),
      }),
    );
  });

  it('calls a runaway re-trigger chain an anomaly instead of a normal turn', async () => {
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'hi' });

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: RunInstance) {
      this.sentTexts = ['ok'];
      return agentRunResult('ok', ['ok']);
    });
    const conversationCrud = await import('@repo/db/crud/conversation');
    const pendingSpy = vi.spyOn(conversationCrud, 'checkPendingMessages').mockResolvedValue(false);

    const { events } = await runAndCapture(seed.conversation.id, 7);

    runSpy.mockRestore();
    pendingSpy.mockRestore();

    expect(kinds(events)).toEqual(['run_loop_depth']);
    expect(of(events, 'anomaly')[0]).toMatchObject({ count: 7, runDepth: 7 });
    expect(of(events, 'agent_run')[0]).toMatchObject({ ok: true, reTriggered: false });
  });
});
