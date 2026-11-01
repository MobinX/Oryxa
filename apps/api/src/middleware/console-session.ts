import type { Context, MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import {
  CONSOLE_CAPABILITIES,
  capabilityForAdminApiPath,
  consoleCan,
  type ConsoleCapability,
} from '@api/lib/console-capabilities';
import {
  hashConsoleSessionToken,
  isConsoleSessionToken,
  mailDomain,
} from '@api/lib/console-auth';
import { getConsoleUserBySessionHash } from '@repo/db/crud/console-users';

export type ConsoleSessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'superuser' | 'admin';
  capabilities: string[];
  isActive: boolean;
  legacy?: boolean;
};

function isLegacyOperatorBearer(header: string | undefined): boolean {
  const expected = process.env.LOGS_UI_PASSWORD?.trim();
  if (!expected || expected.length < 12 || expected.toLowerCase() === 'change-me') return false;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!bearer) return false;
  const a = Buffer.from(bearer);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerFrom(c: Context): string | undefined {
  const header = c.req.header('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

export function legacyConsoleUser(): ConsoleSessionUser {
  const email =
    process.env.MAIL_OPERATOR_EMAIL?.trim().toLowerCase() ||
    process.env.ADMIN_SIGNIN_EMAIL?.trim().toLowerCase() ||
    `ceo@${mailDomain()}`;
  return {
    id: 'legacy-operator',
    email,
    name: 'Operator',
    role: 'superuser',
    capabilities: [...CONSOLE_CAPABILITIES],
    isActive: true,
    legacy: true,
  };
}

export async function consoleUserFromBearer(
  bearer: string | undefined,
): Promise<ConsoleSessionUser | null> {
  if (!bearer || !isConsoleSessionToken(bearer)) return null;
  const user = await getConsoleUserBySessionHash(hashConsoleSessionToken(bearer));
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    capabilities: user.capabilities,
    isActive: user.isActive,
  };
}

export function consoleUserFromContext(c: Context): ConsoleSessionUser | null {
  return (c.get('consoleUser') as ConsoleSessionUser | undefined) ?? null;
}

async function authenticate(c: Context): Promise<ConsoleSessionUser | null> {
  const bearer = bearerFrom(c);
  if (bearer && isConsoleSessionToken(bearer)) {
    return await consoleUserFromBearer(bearer);
  }
  if (isLegacyOperatorBearer(c.req.header('Authorization'))) return legacyConsoleUser();
  return null;
}

export const consoleAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('consoleUser', user);
  return next();
};

export const consoleMailMiddleware: MiddlewareHandler = async (c, next) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!consoleCan(user, 'inbox')) return c.json({ error: 'Forbidden' }, 403);
  c.set('consoleUser', user);
  return next();
};

export const superuserMiddleware: MiddlewareHandler = async (c, next) => {
  const bearer = bearerFrom(c);
  const user = await consoleUserFromBearer(bearer);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'superuser') return c.json({ error: 'Superuser required' }, 403);
  c.set('consoleUser', user);
  return next();
};

export function enforceConsoleCapability(
  c: Context,
  user: ConsoleSessionUser,
  capability: ConsoleCapability | null,
): boolean {
  if (!capability) return true;
  return consoleCan(user, capability);
}

export function capabilityForRequest(c: Context): ConsoleCapability | null {
  return capabilityForAdminApiPath(c.req.path);
}
