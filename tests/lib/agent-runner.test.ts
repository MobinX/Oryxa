import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { runAgentForConversation, triggerAgentRun } from '@api/lib/agent-runner';
import { listMessages } from '@repo/db/crud/conversation';
import { getConversationForBusiness } from '@repo/db/crud/conversation';
import type { AgentConfig } from '@repo/agent';

const sendMessageMock = vi.fn(async () => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

vi.mock('@repo/agent', async ({ importOriginal }) => {
  const mod = await importOriginal<typeof import('@repo/agent')>();
  const { createSendMessageFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({
          ...config,
          llm: config.llm ?? createSendMessageFakeLlm('Automated reply from test agent'),
        });
      }
    },
  };
});

describe('Agent Runner', () => {
  withPglite();
  beforeEach(() => sendMessageMock.mockClear());

  it('runAgentForConversation saves AI reply and sets state done', async () => {
    const seed = await seedTestWorld();
    await runAgentForConversation(seed.conversation.id);

    const conv = await getConversationForBusiness(seed.conversation.id, seed.business.id);
    expect(conv?.lastMessageState).toBe('done');

    const messages = await listMessages(seed.conversation.id, seed.business.id);
    const aiMessages = messages?.filter((m) => m.from === 'self');
    expect(aiMessages?.length).toBeGreaterThan(0);
  }, 30_000);

  it('runAgentForConversation handles agent errors gracefully', async () => {
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockRejectedValueOnce(new Error('agent failed'));

    const seed = await seedTestWorld();
    await runAgentForConversation(seed.conversation.id);

    const conv = await getConversationForBusiness(seed.conversation.id, seed.business.id);
    expect(conv?.lastMessageState).toBe('done');
    runSpy.mockRestore();
  }, 30_000);

  it('runAgentForConversation returns early when conversation has no agent', async () => {
    const seed = await seedTestWorld();
    const { updateChannelAgent } = await import('@repo/db/crud/channel');
    await updateChannelAgent(seed.channel.id, seed.business.id, null);

    const messagesBefore = await listMessages(seed.conversation.id, seed.business.id);
    await runAgentForConversation(seed.conversation.id);
    const messagesAfter = await listMessages(seed.conversation.id, seed.business.id);
    expect(messagesAfter?.length).toBe(messagesBefore?.length);
  });

  it('runAgentForConversation re-triggers when pending messages remain', async () => {
    const seed = await seedTestWorld();
    const fetchMock = vi.fn(async () => new Response('accepted', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const conversationCrud = await import('@repo/db/crud/conversation');
    const pendingSpy = vi.spyOn(conversationCrud, 'checkPendingMessages').mockResolvedValue(true);

    await runAgentForConversation(seed.conversation.id);
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/internal/run'),
      expect.objectContaining({ method: 'POST' }),
    );
    pendingSpy.mockRestore();
    vi.unstubAllGlobals();
  }, 30_000);

  it('runAgentForConversation does not double-send when the agent used send_message', async () => {
    // #8: when the agent called send_message (sentTexts populated), the tool is
    // the source of truth — the runner must NOT send or save a fallback reply.
    const seed = await seedTestWorld();
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this) {
      this.sentTexts = ['reply via tool'];
      return 'final summary that must not be sent';
    });

    sendMessageMock.mockClear();
    await runAgentForConversation(seed.conversation.id);

    expect(sendMessageMock).not.toHaveBeenCalled();
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    const selfContents = messages?.filter((m) => m.from === 'self').map((m) => m.content);
    expect(selfContents).not.toContain('final summary that must not be sent');

    runSpy.mockRestore();
  }, 30_000);

  it('runAgentForConversation falls back to send+save when the agent did not use send_message', async () => {
    // #8 fallback path: agent produced a reply but never called send_message,
    // so the runner sends and persists that reply itself.
    const seed = await seedTestWorld();
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this) {
      this.sentTexts = [];
      return 'fallback reply';
    });

    sendMessageMock.mockClear();
    await runAgentForConversation(seed.conversation.id);

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      seed.conversation.customerPlatformId,
      'fallback reply',
    );
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    const selfContents = messages?.filter((m) => m.from === 'self').map((m) => m.content);
    expect(selfContents).toContain('fallback reply');

    runSpy.mockRestore();
  }, 30_000);

  it('runAgentForConversation drains a burst of pending messages in one run', async () => {
    // #1/#2: a burst larger than the 10-message history cap must be fully loaded
    // into the agent's history (in order) and fully marked done in one run,
    // rather than the newest 10 first and the older ones in a later run.
    const seed = await seedTestWorld();
    const { createMessage } = await import('@repo/db/crud/conversation');
    for (let i = 0; i < 12; i++) {
      await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: `burst ${i}` });
    }

    const { Agent } = await import('@repo/agent');
    let capturedHistory: Array<{ from: string; content: string }> = [];
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: unknown) {
      capturedHistory = [...(this as { config: { history: Array<{ from: string; content: string }> } }).config.history];
      (this as { sentTexts: string[] }).sentTexts = ['reply'];
      return 'done';
    });

    sendMessageMock.mockClear();
    await runAgentForConversation(seed.conversation.id);

    const burstIndices = capturedHistory
      .filter((m) => m.content.startsWith('burst '))
      .map((m) => Number(m.content.replace('burst ', '')))
      .sort((a, b) => a - b);
    expect(burstIndices).toEqual(Array.from({ length: 12 }, (_, i) => i));

    const msgs = await listMessages(seed.conversation.id, seed.business.id);
    const stillPending = msgs?.filter((m) => m.from === 'customer' && m.state === 'pending');
    expect(stillPending?.length).toBe(0);

    runSpy.mockRestore();
  }, 30_000);

  it('triggerAgentRun fires fetch to internal endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('accepted', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    triggerAgentRun('conv-123');
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/internal/run'),
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });
});
