import { and, asc, eq, gt, lt, ne } from 'drizzle-orm';
import { db } from '@db/client';
import { consoleSessions, consoleUsers } from '@db/schema';

export type ConsoleRole = 'superuser' | 'admin';
export type ConsoleUserRow = typeof consoleUsers.$inferSelect;
export type ConsoleUserPublic = Omit<ConsoleUserRow, 'passwordHash'>;

function publicUser(row: ConsoleUserRow): ConsoleUserPublic {
  const { passwordHash: _passwordHash, ...rest } = row;
  return rest;
}

const PUBLIC_COLUMNS = {
  id: consoleUsers.id,
  email: consoleUsers.email,
  name: consoleUsers.name,
  role: consoleUsers.role,
  capabilities: consoleUsers.capabilities,
  isActive: consoleUsers.isActive,
  createdBy: consoleUsers.createdBy,
  createdAt: consoleUsers.createdAt,
  updatedAt: consoleUsers.updatedAt,
};

export async function listConsoleUsers(): Promise<ConsoleUserPublic[]> {
  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(consoleUsers)
    .orderBy(asc(consoleUsers.role), asc(consoleUsers.createdAt));
  return rows as ConsoleUserPublic[];
}

export async function getConsoleUserByEmail(email: string): Promise<ConsoleUserRow | null> {
  const [row] = await db
    .select()
    .from(consoleUsers)
    .where(eq(consoleUsers.email, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function getConsoleUserById(id: string): Promise<ConsoleUserPublic | null> {
  const [row] = await db.select(PUBLIC_COLUMNS).from(consoleUsers).where(eq(consoleUsers.id, id)).limit(1);
  return (row as ConsoleUserPublic | undefined) ?? null;
}

export async function createConsoleUser(input: {
  email: string;
  passwordHash: string;
  name?: string | null;
  role?: ConsoleRole;
  capabilities?: string[];
  createdBy?: string | null;
}): Promise<ConsoleUserPublic> {
  const [row] = await db
    .insert(consoleUsers)
    .values({
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name?.trim() || null,
      role: input.role ?? 'admin',
      capabilities: input.capabilities ?? [],
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return publicUser(row);
}

export async function updateConsoleUser(
  id: string,
  patch: {
    name?: string | null;
    passwordHash?: string;
    capabilities?: string[];
    isActive?: boolean;
  },
): Promise<ConsoleUserPublic | null> {
  const values: Partial<typeof consoleUsers.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name?.trim() || null;
  if (patch.passwordHash !== undefined) values.passwordHash = patch.passwordHash;
  if (patch.capabilities !== undefined) values.capabilities = patch.capabilities;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;

  const [row] = await db.update(consoleUsers).set(values).where(eq(consoleUsers.id, id)).returning();
  return row ? publicUser(row) : null;
}

export async function deleteConsoleUser(id: string): Promise<boolean> {
  const rows = await db.delete(consoleUsers).where(eq(consoleUsers.id, id)).returning({ id: consoleUsers.id });
  return rows.length > 0;
}

export async function createConsoleSession(input: {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(consoleSessions).values(input);
}

export async function getConsoleUserBySessionHash(
  tokenHash: string,
): Promise<ConsoleUserPublic | null> {
  const [row] = await db
    .select(PUBLIC_COLUMNS)
    .from(consoleSessions)
    .innerJoin(consoleUsers, eq(consoleSessions.userId, consoleUsers.id))
    .where(
      and(
        eq(consoleSessions.tokenHash, tokenHash),
        gt(consoleSessions.expiresAt, new Date()),
        eq(consoleUsers.isActive, true),
      ),
    )
    .limit(1);
  return (row as ConsoleUserPublic | undefined) ?? null;
}

export async function deleteConsoleSession(tokenHash: string): Promise<void> {
  await db.delete(consoleSessions).where(eq(consoleSessions.tokenHash, tokenHash));
}

export async function deleteConsoleSessionsForUser(
  userId: string,
  exceptTokenHash?: string,
): Promise<void> {
  await db
    .delete(consoleSessions)
    .where(
      exceptTokenHash
        ? and(eq(consoleSessions.userId, userId), ne(consoleSessions.tokenHash, exceptTokenHash))
        : eq(consoleSessions.userId, userId),
    );
}

export async function purgeExpiredConsoleSessions(): Promise<void> {
  await db.delete(consoleSessions).where(lt(consoleSessions.expiresAt, new Date()));
}
