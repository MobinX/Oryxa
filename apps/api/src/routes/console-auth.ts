import { Hono, type Context } from 'hono';
import {
  createConsoleSession,
  createConsoleUser,
  deleteConsoleSession,
  deleteConsoleSessionsForUser,
  deleteConsoleUser,
  getConsoleUserByEmail,
  getConsoleUserById,
  listConsoleUsers,
  purgeExpiredConsoleSessions,
  updateConsoleUser,
} from '@repo/db/crud/console-users';
import {
  CONSOLE_SESSION_MS,
  consolePasswordProblem,
  hashConsolePassword,
  hashConsoleSessionToken,
  isAllowedConsoleMailAddress,
  isConsoleSessionToken,
  newConsoleSessionToken,
  normalizeConsoleEmail,
  verifyConsolePassword,
} from '@api/lib/console-auth';
import { isConsoleCapability } from '@api/lib/console-capabilities';
import {
  consoleAuthMiddleware,
  consoleUserFromContext,
  superuserMiddleware,
} from '@api/middleware/console-session';
import { ensureMailbox, MailWorkerError } from '@api/lib/mail-worker';

export const consoleAuthRouter = new Hono();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;
const loginAttempts = new Map<string, { count: number; first: number }>();

function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || now - current.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now });
    return false;
  }
  current.count += 1;
  return current.count > LOGIN_MAX;
}

function publicUser(row: {
  id: string;
  email: string;
  name: string | null;
  role: 'superuser' | 'admin';
  capabilities: string[];
  isActive: boolean;
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    capabilities: row.capabilities,
    isActive: row.isActive,
  };
}

async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readCapabilities(value: unknown): string[] | { error: string } {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return { error: 'capabilities must be an array' };
  const values: string[] = [];
  for (const item of value) {
    if (!isConsoleCapability(item)) return { error: `Unknown capability: ${String(item)}` };
    if (!values.includes(item)) values.push(item);
  }
  return values;
}

async function login(c: Context, superuserOnly: boolean): Promise<Response> {
  const ip = clientIp(c);
  if (rateLimited(ip)) return c.json({ error: 'Too many sign-in attempts' }, 429);
  const body = await jsonBody(c);
  const email = typeof body?.email === 'string' ? normalizeConsoleEmail(body.email) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

  const row = await getConsoleUserByEmail(email);
  if (!row) return c.json({ error: 'Invalid email or password' }, 401);
  const valid = await verifyConsolePassword(password, row.passwordHash);
  if (!valid) return c.json({ error: 'Invalid email or password' }, 401);
  if (!row.isActive) return c.json({ error: 'This admin account is disabled' }, 403);
  if (superuserOnly && row.role !== 'superuser') {
    return c.json({ error: 'Superuser access required' }, 403);
  }

  await purgeExpiredConsoleSessions().catch(() => {});
  const token = newConsoleSessionToken();
  await createConsoleSession({
    tokenHash: hashConsoleSessionToken(token),
    userId: row.id,
    expiresAt: new Date(Date.now() + CONSOLE_SESSION_MS),
  });
  loginAttempts.delete(ip);
  return c.json({ token, user: publicUser(row) });
}

consoleAuthRouter.post('/admin/login', (c) => login(c, false));
consoleAuthRouter.post('/superuser/login', (c) => login(c, true));

consoleAuthRouter.get('/admin/me', consoleAuthMiddleware, (c) => {
  const user = consoleUserFromContext(c);
  return c.json({ user });
});

consoleAuthRouter.post('/admin/logout', consoleAuthMiddleware, async (c) => {
  const header = c.req.header('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer && isConsoleSessionToken(bearer)) {
    await deleteConsoleSession(hashConsoleSessionToken(bearer));
  }
  return c.body(null, 204);
});

consoleAuthRouter.post('/admin/password', consoleAuthMiddleware, async (c) => {
  const user = consoleUserFromContext(c);
  if (!user || user.legacy) {
    return c.json({ error: 'The legacy console password is managed by deployment environment variables' }, 400);
  }
  const body = await jsonBody(c);
  const current = typeof body?.current === 'string' ? body.current : '';
  const next = typeof body?.next === 'string' ? body.next : '';
  if (!current || !next) return c.json({ error: 'Current and new password are required' }, 400);
  const problem = consolePasswordProblem(next);
  if (problem) return c.json({ error: problem }, 400);

  const row = await getConsoleUserByEmail(user.email);
  if (!row || !(await verifyConsolePassword(current, row.passwordHash))) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }
  const passwordHash = await hashConsolePassword(next);
  await updateConsoleUser(user.id, { passwordHash });
  const header = c.req.header('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  await deleteConsoleSessionsForUser(
    user.id,
    bearer && isConsoleSessionToken(bearer) ? hashConsoleSessionToken(bearer) : undefined,
  );
  return c.body(null, 204);
});

consoleAuthRouter.get('/superuser/admins', superuserMiddleware, async (c) => {
  const admins = await listConsoleUsers();
  return c.json({ admins });
});

consoleAuthRouter.post('/superuser/admins', superuserMiddleware, async (c) => {
  const actor = consoleUserFromContext(c);
  const body = await jsonBody(c);
  const email = typeof body?.email === 'string' ? normalizeConsoleEmail(body.email) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 255) : null;
  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);
  if (!isAllowedConsoleMailAddress(email)) {
    return c.json({ error: `Admin mail must be an @${process.env.MAIL_DOMAIN || 'onlyorders.tech'} address` }, 400);
  }
  const problem = consolePasswordProblem(password);
  if (problem) return c.json({ error: problem }, 400);
  const capabilities = readCapabilities(body?.capabilities);
  if (!Array.isArray(capabilities)) return c.json({ error: capabilities.error }, 400);
  if (await getConsoleUserByEmail(email)) return c.json({ error: 'An admin already uses that email' }, 409);

  const created = await createConsoleUser({
    email,
    passwordHash: await hashConsolePassword(password),
    name,
    role: 'admin',
    capabilities,
    createdBy: actor?.id ?? null,
  });
  try {
    await ensureMailbox(created.email, created.name);
  } catch (error) {
    await deleteConsoleUser(created.id).catch(() => {});
    if (error instanceof MailWorkerError) {
      return c.json({ error: `Admin was not created: ${error.message}` }, 502);
    }
    throw error;
  }
  return c.json({ admin: publicUser(created) }, 201);
});

consoleAuthRouter.patch('/superuser/admins/:id', superuserMiddleware, async (c) => {
  const id = c.req.param('id');
  const target = await getConsoleUserById(id);
  if (!target) return c.json({ error: 'Admin not found' }, 404);
  if (target.role === 'superuser') return c.json({ error: 'The superuser cannot be edited here' }, 403);

  const body = await jsonBody(c);
  const patch: {
    name?: string | null;
    capabilities?: string[];
    isActive?: boolean;
    passwordHash?: string;
  } = {};
  if (body?.name !== undefined) {
    patch.name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) || null : null;
  }
  if (body?.capabilities !== undefined) {
    const capabilities = readCapabilities(body.capabilities);
    if (!Array.isArray(capabilities)) return c.json({ error: capabilities.error }, 400);
    patch.capabilities = capabilities;
  }
  if (body?.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return c.json({ error: 'isActive must be boolean' }, 400);
    patch.isActive = body.isActive;
  }
  if (body?.password !== undefined) {
    if (typeof body.password !== 'string') return c.json({ error: 'password must be a string' }, 400);
    const problem = consolePasswordProblem(body.password);
    if (problem) return c.json({ error: problem }, 400);
    patch.passwordHash = await hashConsolePassword(body.password);
  }

  const updated = await updateConsoleUser(id, patch);
  if (!updated) return c.json({ error: 'Admin not found' }, 404);
  if (patch.passwordHash || patch.isActive === false) await deleteConsoleSessionsForUser(id);
  return c.json({ admin: publicUser(updated) });
});

consoleAuthRouter.delete('/superuser/admins/:id', superuserMiddleware, async (c) => {
  const id = c.req.param('id');
  const target = await getConsoleUserById(id);
  if (!target) return c.json({ error: 'Admin not found' }, 404);
  if (target.role === 'superuser') return c.json({ error: 'The superuser cannot be deleted' }, 403);
  await deleteConsoleUser(id);
  return c.body(null, 204);
});

consoleAuthRouter.onError((error, c) => {
  if (error instanceof MailWorkerError) return c.json({ error: error.message }, error.status as 400);
  return c.json({ error: 'Console auth failed' }, 500);
});
