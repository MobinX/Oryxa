import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { runAgentForConversation } from '@api/lib/agent-runner';
import { listMessages, setConversationAiPaused } from '@repo/db/crud/conversation';
import { saveChannelAiConfig } from '@repo/db/crud/ai-config';
import type { AgentConfig } from '@repo/agent';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  senderAction: vi.fn(async () => undefined),
}));

vi.mock('@repo/agent', async () => {
  const mod = await import('../../packages/agent/index');
  const { createDefaultReplyFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({
          ...config,
          llm: config.llm ?? createDefaultReplyFakeLlm('Automated reply from test agent'),
        });
      }
    },
  };
});

/**
 * The AI Studio gate — spec B/E's hardest promise: with the channel off or after a human
 * takeover, the runner answers nothing, sends nothing, and records why.
 */
describe('AI settings gate', () => {
  withPglite();
  beforeEach(() => sendMessageMock.mockClear());

  async function aiMessages(seed: Awaited<ReturnType<typeof seedTestWorld>>) {
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    return messages?.filter((m) => m.from === 'self') ?? [];
  }

  it('a paused conversation never answers, even on a fresh trigger', async () => {
    const seed = await seedTestWorld();
    await setConversationAiPaused(seed.business.id, seed.conversation.id, true);

    await runAgentForConversation(seed.conversation.id);

    expect(await aiMessages(seed)).toHaveLength(0);
    expect(sendMessageMock).not.toHaveBeenCalled();

    // Resuming replay restores the answer.
    await setConversationAiPaused(seed.business.id, seed.conversation.id, false);
    await runAgentForConversation(seed.conversation.id);
    expect((await aiMessages(seed)).length).toBeGreaterThan(0);
  }, 30_000);

  it('a channel with aiEnabled=false never answers', async () => {
    const seed = await seedTestWorld();
    await saveChannelAiConfig(seed.channel.id, {
      channelId: seed.channel.id,
      aiEnabled: false,
    });

    await runAgentForConversation(seed.conversation.id);
    expect(await aiMessages(seed)).toHaveLength(0);
    expect(sendMessageMock).not.toHaveBeenCalled();

    await saveChannelAiConfig(seed.channel.id, {
      channelId: seed.channel.id,
      aiEnabled: true,
    });
    await runAgentForConversation(seed.conversation.id);
    expect((await aiMessages(seed)).length).toBeGreaterThan(0);
  }, 30_000);
});
