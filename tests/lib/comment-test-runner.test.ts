import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { agentRunResult } from '../helpers/agent-run';
import { runCommentTest } from '@api/lib/comment-test-runner';
import { listComments } from '@repo/db/crud/comment';
import { updateAgent } from '@repo/db/crud/channel';
import type { AgentConfig } from '@repo/agent';

const replyToFacebookCommentMock = vi.fn(async (..._args: unknown[]) => 'REAL_REPLY_ID');
const sendCommenterMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  replyToFacebookComment: (...args: unknown[]) => replyToFacebookCommentMock(...args),
  sendCommenterMessage: (...args: unknown[]) => sendCommenterMessageMock(...args),
  sendMessage: vi.fn(),
  getFacebookPostContext: vi.fn(async () => null),
}));

vi.mock('@repo/agent', async () => {
  const mod = await import('../../packages/agent/index');
  const { createDefaultReplyFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({ ...config, llm: config.llm ?? createDefaultReplyFakeLlm('') });
      }
    },
  };
});

type Tool = { name: string; invoke: (args: Record<string, unknown>) => Promise<string> };

/** The agent's own hand, on the tools the runner gave it — what a real turn would do. */
function toolsOf(ctx: { config: AgentConfig }): Tool[] {
  return ctx.config.tools as unknown as Tool[];
}

const call = async (tools: Tool[], name: string, text: string) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no ${name} tool was built for this run`);
  return tool.invoke({ text });
};

describe('comment playground runner', () => {
  withPglite();

  beforeEach(() => {
    replyToFacebookCommentMock.mockClear();
    sendCommenterMessageMock.mockClear();
  });

  it('streams both delivery choices and puts nothing on the wire', async () => {
    const seed = await seedTestWorld();
    const events: { event: string; data: Record<string, unknown> }[] = [];
    const emit = (event: string, data: unknown) => {
      events.push({ event, data: data as Record<string, unknown> });
    };

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: { config: AgentConfig }) {
      const tools = toolsOf(this);
      await call(tools, 'send_private_message', 'It is $59 and 5 pieces are left.');
      await call(tools, 'reply_comment', 'Sent you the price and what is left in Messenger — please check your inbox!');
      return agentRunResult('');
    });

    try {
      await runCommentTest(
        {
          businessId: seed.business.id,
          channelId: seed.channel.id,
          comment: 'price bhai?',
          commenterPlatformId: 'PLAYGROUND_USER',
          commenterName: 'Playground User',
          postId: 'PLAYGROUND_POST',
        },
        emit,
      );
    } finally {
      runSpy.mockRestore();
    }

    const dm = events.find((e) => e.event === 'private_message_sent');
    const posted = events.find((e) => e.event === 'comment_replied');
    expect(String(dm?.data.text)).toContain('$59');
    expect(String(posted?.data.text)).toMatch(/Messenger/i);

    // A playground run never posts to a Page and never opens a real inbox.
    expect(replyToFacebookCommentMock).not.toHaveBeenCalled();
    expect(sendCommenterMessageMock).not.toHaveBeenCalled();

    // The thread it drew is a real thread, and the comment it answered is retired so the
    // live runner cannot pick the same line up again later.
    const threadId = String(events.find((e) => e.event === 'thread_ready')?.data.commentThreadId);
    const all = await listComments(threadId);
    const asked = all.find((c) => c.content === 'price bhai?');
    expect(asked?.state).toBe('done');
    expect(all.find((c) => c.from === 'self')?.content).toMatch(/Messenger/i);
  }, 60_000);

  it('hands the agent the earlier lines, and reports a run that delivered nothing', async () => {
    const seed = await seedTestWorld();
    const events: { event: string; data: Record<string, unknown> }[] = [];
    const emit = (event: string, data: unknown) => {
      events.push({ event, data: data as Record<string, unknown> });
    };

    let seenHistory: { from: string; content: string }[] = [];
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: { config: AgentConfig }) {
      seenHistory = this.config.history as unknown as { from: string; content: string }[];
      return agentRunResult('SILENT');
    });

    try {
      await runCommentTest(
        {
          businessId: seed.business.id,
          channelId: seed.channel.id,
          comment: 'is this soap good for whitening?',
          commenterPlatformId: 'PLAYGROUND_QUIET',
          postId: 'PLAYGROUND_POST_2',
          history: [
            { from: 'customer', content: 'do you ship outside dhaka?' },
            { from: 'self', content: 'yes, nationwide delivery available' },
          ],
        },
        emit,
      );
    } finally {
      runSpy.mockRestore();
    }

    // The page's own earlier answer arrives as a `self` line, exactly as the live runner
    // reads it — which is how an admin's manual reply stops the agent repeating it.
    expect(seenHistory).toEqual([
      { from: 'customer', content: 'do you ship outside dhaka?' },
      { from: 'self', content: 'yes, nationwide delivery available' },
      { from: 'customer', content: 'is this soap good for whitening?' },
    ]);

    const nothing = events.find((e) => e.event === 'no_reply');
    expect(nothing?.data.silent).toBe(true);
    expect(events.some((e) => e.event === 'comment_replied')).toBe(false);
  }, 60_000);

  it('runs the wording the store wrote, and Oryxa\'s while it has written none', async () => {
    const seed = await seedTestWorld();
    const { getChannelById } = await import('@repo/db/crud/channel');
    // The wording rides the agent the channel answers with, which is what the runner reads.
    const channelAgent = (await getChannelById(seed.channel.id))!.agent!;
    const seen: (string | undefined)[] = [];
    const { Agent, COMMENT_REPLY_GUIDANCE } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: { config: AgentConfig }) {
      seen.push(this.config.replyGuidance);
      return agentRunResult('SILENT');
    });

    try {
      await runCommentTest({
        businessId: seed.business.id,
        channelId: seed.channel.id,
        comment: 'price?',
        commenterPlatformId: 'GUIDANCE_USER',
        postId: 'GUIDANCE_POST',
      });
      expect(seen[0]).toBe(COMMENT_REPLY_GUIDANCE);

      await updateAgent(seed.business.id, channelAgent.id, {
        commentReplyGuidance: 'Only ever say hi.',
      });
      await runCommentTest({
        businessId: seed.business.id,
        channelId: seed.channel.id,
        comment: 'price again?',
        commenterPlatformId: 'GUIDANCE_USER',
        postId: 'GUIDANCE_POST',
      });
      expect(seen[1]).toBe('Only ever say hi.');
    } finally {
      runSpy.mockRestore();
    }
  }, 60_000);
});
