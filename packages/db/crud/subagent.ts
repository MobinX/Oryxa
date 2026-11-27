import { asc, eq } from 'drizzle-orm';
import { db } from '@db/client';
import { subagents } from '@db/schema';
import {
  PRODUCT_INFO_SYSTEM_PROMPT,
  SUBAGENT_KEYS,
  subagentDefinition,
  type SubagentDefinition,
  type SubagentKey,
} from '@repo/shared';
import { sinceCondition } from './since';

/**
 * The hidden helper agents' instructions, read from the database rather than a code constant.
 *
 * The shape is the one `default_agent` already proved: a row is created on first read from the
 * reviewed text in `@repo/shared`, then every run reads the row. That keeps two things true at once —
 * a fresh environment answers without a seed step, and an operator's edit is what customers get on
 * the next turn, with no deploy in between.
 *
 * The reviewed default is never written back over an existing row. It is returned alongside the row
 * so the console can offer a restore, which is a separate, deliberate write.
 */

export type SubagentRow = {
  key: SubagentKey;
  name: string;
  description: string;
  systemPrompt: string;
  defaultPrompt: string;
  isDefault: boolean;
  updatedAt: Date;
};

function shape(definition: SubagentDefinition, row: { systemPrompt: string; updatedAt: Date }): SubagentRow {
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    systemPrompt: row.systemPrompt,
    defaultPrompt: definition.defaultPrompt,
    isDefault: row.systemPrompt.trim() === definition.defaultPrompt.trim(),
    updatedAt: row.updatedAt,
  };
}

/**
 * The row for one key, created from its reviewed default when it does not exist yet.
 *
 * Two first reads can race; the insert is therefore `onConflictDoNothing` and the winner is read
 * back, so the caller always gets the row that is actually in the database and never a lost prompt.
 */
export async function getSubagent(key: string): Promise<SubagentRow | null> {
  const definition = subagentDefinition(key);
  if (!definition) return null;

  const existing = await db.query.subagents.findFirst({ where: eq(subagents.key, definition.key) });
  if (existing) return shape(definition, existing);

  await db
    .insert(subagents)
    .values({
      key: definition.key,
      name: definition.name,
      systemPrompt: definition.defaultPrompt,
    })
    .onConflictDoNothing({ target: subagents.key });

  const created = await db.query.subagents.findFirst({ where: eq(subagents.key, definition.key) });
  // The insert cannot lose unless a concurrent writer deleted it in between; the default is still a
  // truthful answer in that case, and saying "not found" would make the console look empty.
  return created ? shape(definition, created) : shape(definition, { systemPrompt: definition.defaultPrompt, updatedAt: new Date() });
}

/** Every registered subagent, in a stable order, for the console's list. */
export async function listSubagents(since?: unknown): Promise<SubagentRow[]> {
  const sinceFilter = sinceCondition(subagents.updatedAt, since);
  const rows = await db.query.subagents.findMany({
    where: sinceFilter,
    orderBy: [asc(subagents.key)],
  });
  const known = rows
    .map((row) => {
      const definition = subagentDefinition(row.key);
      return definition ? shape(definition, row) : null;
    })
    .filter((row): row is SubagentRow => row !== null);

  // A key the code knows but the table does not is still a subagent the operator should see, so the
  // list is built from the definitions and filled from the rows, not the other way around.
  const missing = SUBAGENT_KEYS.filter((key) => !known.some((row) => row.key === key)).map((key) =>
    getSubagent(key),
  );
  const filled = await Promise.all(missing);
  return [...known, ...filled.filter((row): row is SubagentRow => row !== null)].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

/** The operator's edit. The reviewed default stays in code, so a restore is just writing it back. */
export async function updateSubagentPrompt(key: string, systemPrompt: string): Promise<SubagentRow | null> {
  const current = await getSubagent(key);
  if (!current) return null;

  const definition = subagentDefinition(current.key)!;
  const [updated] = await db
    .update(subagents)
    .set({ systemPrompt, updatedAt: new Date() })
    .where(eq(subagents.key, current.key))
    .returning();

  return updated ? shape(definition, updated) : null;
}

/**
 * What the product-answer writer runs with. Read on every tool call: an edit reaches the next
 * customer turn, which is the whole point of keeping it out of the code.
 */
export async function getProductInfoPrompt(): Promise<string> {
  const row = await getSubagent('product_info');
  return row?.systemPrompt ?? PRODUCT_INFO_SYSTEM_PROMPT;
}
