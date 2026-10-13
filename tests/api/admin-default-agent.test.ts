import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { app } from '@api/index';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import { COMMENT_REPLY_GUIDANCE, DEFAULT_REPLY_GUIDANCE } from '@repo/agent';
import { DEFAULT_AGENT_PROMPT, getPlatformAgent } from '@repo/db/crud/default-agent';
import { getAgentById, updateAgent } from '@repo/db/crud/channel';
import { db } from '@db/client';
import { agents, defaultAgents } from '@db/schema';

const URL = 'http://localhost/api2/admin/default-agent';

type PlatformRow = {
  id: string;
  systemPrompt: string;
  replyGuidance: string | null;
  commentReplyGuidance: string | null;
  guidanceDefaults: { replyGuidance: string; commentReplyGuidance: string };
};

/** The bearer the test environment hands out when `LOGS_UI_PASSWORD` is unset. */
const OPERATOR = logsOperatorPassword();
const bearer = (token: string) => `Bearer ${token}`;

const getAs = (auth?: string) =>
  app.request(URL, { headers: auth ? { Authorization: auth } : {} });

const putAs = (body: unknown, auth?: string) =>
  app.request(URL, {
    method: 'PUT',
    headers: { ...(auth ? { Authorization: auth } : {}), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** A store's row turned into a follower: the seed authors its prompt, so it arrives as an override. */
async function makeFollower(agentId: string) {
  await db.update(agents).set({ followsDefault: true }).where(eq(agents.id, agentId));
}

/**
 * The one write in the product that speaks for every business at once had no test at all, so nothing
 * was pinning the gate in front of it.
 */
describe('the platform default agent', () => {
  withPglite();

  it('mints itself once, from the reviewed text, and names the wording an empty box falls back to', async () => {
    const res = await getAs(bearer(OPERATOR));
    expect(res.status).toBe(200);
    const row = (await res.json()) as PlatformRow;

    expect(row.systemPrompt).toBe(DEFAULT_AGENT_PROMPT);
    expect(row.replyGuidance).toBeNull();
    // Without this the console page cannot show an operator what writing here would replace.
    expect(row.guidanceDefaults.replyGuidance).toBe(DEFAULT_REPLY_GUIDANCE);
    expect(row.guidanceDefaults.commentReplyGuidance).toBe(COMMENT_REPLY_GUIDANCE);

    // Read twice, still one row: every reader takes the oldest, so a racing first read is inert.
    expect(((await getAs(bearer(OPERATOR)).then((r) => r.json())) as PlatformRow).id).toBe(row.id);
    expect(await db.select({ id: defaultAgents.id }).from(defaultAgents)).toHaveLength(1);
    expect((await getPlatformAgent()).id).toBe(row.id);
  });

  it('saves an operator edit and answers with it on the next read', async () => {
    expect((await putAs({ systemPrompt: 'Answer in one line.', replyGuidance: 'Be brief.' }, bearer(OPERATOR))).status).toBe(200);

    const row = (await getAs(bearer(OPERATOR)).then((r) => r.json())) as PlatformRow;
    expect(row.systemPrompt).toBe('Answer in one line.');
    expect(row.replyGuidance).toBe('Be brief.');
    // The row's own wording IS the fallback now, so the box must describe that, not the code block.
    expect(row.guidanceDefaults.replyGuidance).toBe('Be brief.');
  });
});

/**
 * The gate, asserted without ever presenting a forged JWT: a garbage bearer reaches Firebase and
 * answers 503 when no provider is configured, which would test the environment rather than the route.
 * What is provable here is the two things the route actually turns on — the shared bearer, and the
 * allowlist that is shut in production because `LOG_QUERY_USER_IDS` is unset.
 */
describe('the gate in front of the fleet-wide write', () => {
  withPglite();
  const SECRET = 'operator-secret-under-test';

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.LOGS_UI_PASSWORD;
    delete process.env.LOG_QUERY_USER_IDS;
  });

  it('opens for the console bearer and shuts an authenticated caller who is not allowlisted', async () => {
    process.env.LOGS_UI_PASSWORD = SECRET;
    process.env.LOG_QUERY_USER_IDS = 'a-user-id-that-will-not-match';
    await seedTestWorld(); // the dev token only authenticates once its user exists

    expect((await getAs(bearer(SECRET))).status).toBe(200);
    expect((await putAs({ systemPrompt: 'fleet-wide edit' }, bearer(SECRET))).status).toBe(200);

    // A caller who passes ordinary auth but is not the operator: the merchant-shaped request, refused.
    expect((await getAs(bearer('dev-test-token'))).status).toBe(403);
    expect((await putAs({ systemPrompt: 'rewrite every bot' }, bearer('dev-test-token'))).status).toBe(403);
  });

  it('refuses a request that carries no usable credential, even in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOGS_UI_PASSWORD = SECRET;
    delete process.env.LOG_QUERY_USER_IDS;

    expect((await getAs(bearer(SECRET))).status).toBe(200);
    expect((await getAs()).status).toBe(401);
    expect((await getAs('Basic not-a-bearer')).status).toBe(401);
    expect((await putAs({ systemPrompt: 'fleet-wide edit' })).status).toBe(401);
  });

  it('has no operator path at all when production is deployed without the password', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOGS_UI_PASSWORD;

    // The default that answers in a dev box is deliberately not reachable from a production deploy.
    expect(logsOperatorPassword()).toBeUndefined();
  });
});

/**
 * Who is NOT answering with the default, and the click that puts a store back.
 */
describe('the override list', () => {
  withPglite();

  type Report = { following: number; overrides: Array<{ id: string; businessName: string; pages: number }> };

  const report = async () => {
    const res = await app.request('http://localhost/api2/admin/default-agent/overrides', {
      headers: { Authorization: bearer(OPERATOR) },
    });
    expect(res.status).toBe(200);
    return (await res.json()) as Report;
  };

  const followAgain = (agentId: string, auth = bearer(OPERATOR)) =>
    app.request('http://localhost/api2/admin/default-agent/overrides/follow', {
      method: 'POST',
      headers: { Authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });

  it('names the stores that opted out, with the text kept behind them', async () => {
    const { business, agent } = await seedTestWorld();

    const listed = await report();
    const row = listed.overrides.find((o) => o.id === agent.id);
    expect(row).toMatchObject({ businessName: business.name, pages: 1 });

    // Following the default must not erase what the store wrote.
    expect((await followAgain(agent.id)).status).toBe(200);
    const after = await getAgentById(business.id, agent.id);
    expect(after?.followsDefault).toBe(true);
    expect(after?.systemPrompt).toBe(agent.systemPrompt);

    expect((await report()).overrides.some((o) => o.id === agent.id)).toBe(false);
  });

  it('refuses a nameless id and a caller who is not the console', async () => {
    expect((await followAgain('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await app.request('http://localhost/api2/admin/default-agent/overrides')).status).toBe(401);
    // A header that is not a bearer at all: refused before any provider is consulted, so this asserts
    // the same way whether or not Firebase credentials happen to be configured in the environment.
    expect((await followAgain('00000000-0000-4000-8000-000000000000', 'Basic nobody')).status).toBe(401);
  });
});

/**
 * The flag is the mechanism, and nothing wrote to it in a test: a save carrying only nulls used to
 * flip a follower into an override, which is the opposite of what "clear my wording" asks for.
 */
describe('who a store answers with', () => {
  withPglite();

  it('a save that writes no text leaves the store following the default', async () => {
    const { business, agent } = await seedTestWorld();
    await makeFollower(agent.id);
    expect((await getAgentById(business.id, agent.id))?.followsDefault).toBe(true);

    // Nulls are a clear, not a claim of authorship.
    await updateAgent(business.id, agent.id, { replyGuidance: null, commentReplyGuidance: null });
    expect((await getAgentById(business.id, agent.id))?.followsDefault).toBe(true);

    // So is a box emptied by hand.
    await updateAgent(business.id, agent.id, { replyGuidance: '   ' });
    expect((await getAgentById(business.id, agent.id))?.followsDefault).toBe(true);
  });

  it('writing its own prompt makes the store an override, and leaves the platform row alone', async () => {
    const { business, agent } = await seedTestWorld();
    await makeFollower(agent.id);

    await updateAgent(business.id, agent.id, { systemPrompt: 'This store writes its own rules.' });

    const row = await getAgentById(business.id, agent.id);
    expect(row?.followsDefault).toBe(false);
    expect(row?.systemPrompt).toBe('This store writes its own rules.');

    expect((await getPlatformAgent()).systemPrompt).not.toBe('This store writes its own rules.');
  });
});
