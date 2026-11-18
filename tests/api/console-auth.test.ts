import { describe, expect, it } from 'vitest';
import { app } from '@api/app';
import { createConsoleUser } from '@repo/db/crud/console-users';
import { hashConsolePassword } from '@api/lib/console-auth';
import { withPglite } from '../helpers/with-pglite';

async function login(path: string, email: string, password: string) {
  const response = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { token?: string; user?: Record<string, unknown>; error?: string };
  return { response, body };
}

describe('console DB auth and capabilities', () => {
  withPglite({ timeoutMs: 300_000 });

  it('logs in a DB admin, exposes /me and enforces capabilities', async () => {
    const email = 'api-admin@onlyorders.tech';
    const password = 'test-password-123';
    await createConsoleUser({
      email,
      passwordHash: await hashConsolePassword(password),
      capabilities: ['dashboard'],
    });

    const { response, body } = await login('/api2/admin/login', email, password);
    expect(response.status).toBe(200);
    expect(typeof body.token).toBe('string');
    const token = body.token!;

    const me = await app.request('/api2/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user?: { email?: string; capabilities?: string[] } };
    expect(meBody.user?.email).toBe(email);
    expect(meBody.user?.capabilities).toEqual(['dashboard']);

    const forbidden = await app.request('/api2/admin/token-analytics/businesses', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(forbidden.status).toBe(403);

    const logout = await app.request('/api2/admin/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(204);
    const afterLogout = await app.request('/api2/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('requires a superuser session for admin management', async () => {
    const adminEmail = 'api-admin-2@onlyorders.tech';
    const superEmail = 'api-super@onlyorders.tech';
    const password = 'test-password-123';
    await createConsoleUser({
      email: adminEmail,
      passwordHash: await hashConsolePassword(password),
      capabilities: ['dashboard'],
    });
    await createConsoleUser({
      email: superEmail,
      passwordHash: await hashConsolePassword(password),
      role: 'superuser',
      capabilities: [],
    });

    const adminLogin = await login('/api2/admin/login', adminEmail, password);
    const adminToken = adminLogin.body.token!;
    const adminAttempt = await app.request('/api2/superuser/admins', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminAttempt.status).toBe(403);

    const superLogin = await login('/api2/superuser/login', superEmail, password);
    expect(superLogin.response.status).toBe(200);
    const superToken = superLogin.body.token!;
    const superAttempt = await app.request('/api2/superuser/admins', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(superAttempt.status).toBe(200);
    const payload = (await superAttempt.json()) as { admins?: Array<{ email?: string }> };
    expect(payload.admins?.some((admin) => admin.email === superEmail)).toBe(true);
  });

  it('grants the subagent capability, which is a page the console offers', async () => {
    const superEmail = 'api-super-capabilities@onlyorders.tech';
    const adminEmail = 'api-capability-target@onlyorders.tech';
    const password = 'test-password-123';
    await createConsoleUser({
      email: superEmail,
      passwordHash: await hashConsolePassword(password),
      role: 'superuser',
      capabilities: [],
    });
    const target = await createConsoleUser({
      email: adminEmail,
      passwordHash: await hashConsolePassword(password),
      capabilities: ['dashboard'],
    });

    const superLogin = await login('/api2/superuser/login', superEmail, password);
    const superToken = superLogin.body.token!;

    // Before the grant the capability is genuinely absent. An unmapped `/api2/admin/*` path would let
    // this through, so a 200 here would mean the subagent routes were not gated at all.
    const beforeLogin = await login('/api2/admin/login', adminEmail, password);
    const beforeGrant = await app.request('/api2/admin/subagents/product_info', {
      headers: { Authorization: `Bearer ${beforeLogin.body.token!}` },
    });
    expect(beforeGrant.status).toBe(403);

    // This is the request the superuser page sends when it ticks "Subagent prompts". It used to come
    // back 400 "Unknown capability: subagent" because the API kept its own list that lacked the key.
    const granted = await app.request(`/api2/superuser/admins/${target.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ capabilities: ['dashboard', 'subagent'] }),
    });
    expect(granted.status).toBe(200);
    const grantedBody = (await granted.json()) as { admin?: { capabilities?: string[] } };
    expect(grantedBody.admin?.capabilities).toEqual(['dashboard', 'subagent']);

    // And the grant is worth something: the new capability opens its admin API and its page gate.
    const adminLogin = await login('/api2/admin/login', adminEmail, password);
    const adminToken = adminLogin.body.token!;
    const subagentApi = await app.request('/api2/admin/subagents/product_info', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(subagentApi.status).toBe(200);

    const stillForbidden = await app.request('/api2/admin/default-agent', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(stillForbidden.status).toBe(403);
  });
});
