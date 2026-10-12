import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { getFacebookOAuthUrl } from '@repo/integrations/facebook';

vi.mock('@repo/integrations/facebook', async () => {
  const actual = await import('../../packages/integrations/facebook');
  return {
    ...actual,
    getFacebookOAuthUrl: vi.fn(() => 'https://facebook.com/oauth'),
    exchangeCodeForToken: vi.fn(async () => 'user-token'),
    getUserPages: vi.fn(async () => [{ id: 'NEW_PAGE', name: 'Page', access_token: 'page-tok' }]),
    sendMessage: vi.fn(async () => undefined),
  };
});

describe('Channels & Agents API', () => {
  withPglite();

  it('POST /:businessId/agents creates agent', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/agents`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'New Agent',
        systemPrompt: 'Sell products',
        platformType: 'facebook',
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBeDefined();
  });

  it('GET /:businessId/agents lists agents', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/agents`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  it('POST /:businessId/channels links channel', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        platform: 'facebook',
        apiToken: 'manual-token',
        platformChannelId: 'MANUAL_PAGE',
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('linked');
  });

  it('POST /:businessId/channels refuses a page another store already holds', async () => {
    const taken = await seedTestWorld();
    const other = await seedTestWorld();
    const res = await app.request(`/api/v1/${other.business.id}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        platform: 'facebook',
        apiToken: 'steal-token',
        platformChannelId: taken.pageChannelId,
      }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('another store');
  });

  it('GET /:businessId/channels lists channels', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  it('PATCH /:businessId/channels/:channelId/agent is gone — merchants no longer pick agents', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(`/api/v1/${seed.business.id}/channels/${seed.channel.id}/agent`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ agentId: seed.agent.id }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /:businessId/agents/default answers with the store\'s one agent', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/agents/default`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const agent = (await res.json()) as { id: string; systemPrompt: string };
    expect(agent.id).toBeDefined();
    expect(agent.systemPrompt.length).toBeGreaterThan(0);

    // Asking twice must not mint a second agent.
    const again = await app.request(`/api/v1/${business.id}/agents/default`, { headers: authHeaders() });
    expect(((await again.json()) as { id: string }).id).toBe(agent.id);
  });

  it('the two guidance blocks are the store\'s own text, and null puts them back on built-in', async () => {
    const { business } = await seedTestWorld();
    type Row = {
      id: string;
      replyGuidance: string | null;
      commentReplyGuidance: string | null;
      guidanceDefaults: { replyGuidance: string; commentReplyGuidance: string };
    };
    const read = async () =>
      (await (await app.request(`/api/v1/${business.id}/agents/default`, { headers: authHeaders() })).json()) as Row;
    // What the playground does: edit whichever row this store actually answers with.
    const write = async (body: Record<string, unknown>) =>
      (
        await app.request(`/api/v1/${business.id}/agents/${(await read()).id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(body),
        })
      ).status;

    const untouched = await read();
    expect(untouched.replyGuidance).toBeNull();
    expect(untouched.commentReplyGuidance).toBeNull();
    // The playground shows the built-in wording behind an empty box, so it travels with the row.
    expect(untouched.guidanceDefaults.replyGuidance).toContain('send_message');
    expect(untouched.guidanceDefaults.commentReplyGuidance).toContain('send_private_message');

    expect(await write({ replyGuidance: 'Answer in one line.', commentReplyGuidance: 'Never DM.' })).toBe(200);
    const stored = await read();
    expect(stored.replyGuidance).toBe('Answer in one line.');
    expect(stored.commentReplyGuidance).toBe('Never DM.');

    expect(await write({ replyGuidance: null, commentReplyGuidance: null })).toBe(200);
    const cleared = await read();
    expect(cleared.replyGuidance).toBeNull();
    expect(cleared.commentReplyGuidance).toBeNull();
  });

  it('a channel connected without an agent still gets one', async () => {
    const { business } = await seedTestWorld();
    const pageId = `NO_AGENT_PAGE_${Date.now()}`;
    const res = await app.request(`/api/v1/${business.id}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        platform: 'facebook',
        apiToken: 'manual-token',
        platformChannelId: pageId,
      }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };

    const listed = await app.request(`/api/v1/${business.id}/channels`, { headers: authHeaders() });
    const rows = (await listed.json()) as Array<{ id: string; agentId: string | null }>;
    expect(rows.find((r) => r.id === created.id)?.agentId).toBeTruthy();
  });

  it('GET /:businessId/channels/facebook/auth returns oauth url', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels/facebook/auth`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('facebook.com');
  });

  it('hands the portfolio choice to the OAuth url, and nothing when nobody chose', async () => {
    const { business } = await seedTestWorld();
    const asked = vi.mocked(getFacebookOAuthUrl);

    const res = await app.request(
      `/api/v1/${business.id}/channels/facebook/auth?portfolio=true`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(asked).toHaveBeenLastCalledWith(expect.any(String), true);

    const declined = await app.request(
      `/api/v1/${business.id}/channels/facebook/auth?portfolio=false`,
      { headers: authHeaders() },
    );
    expect(declined.status).toBe(200);
    expect(asked).toHaveBeenLastCalledWith(expect.any(String), false);

    asked.mockClear();
    const plain = await app.request(`/api/v1/${business.id}/channels/facebook/auth`, {
      headers: authHeaders(),
    });
    expect(plain.status).toBe(200);
    expect(asked).toHaveBeenLastCalledWith(expect.any(String), undefined);
  });

  it('rejects a portfolio value that is not one of the two the connector offers', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${business.id}/channels/facebook/auth?portfolio=yes`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(400);
  });
});
