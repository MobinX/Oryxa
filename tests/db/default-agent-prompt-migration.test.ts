import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_AGENT_PROMPT } from '@repo/db/crud/default-agent';

/**
 * The default agent's prompt is a database row, so the seed in packages/db/crud/default-agent.ts only
 * reaches production through a migration that rewrites spans of that row in place. Two things go wrong
 * there, and one already did: migration 0024 inserted a section beside text it left standing, so the
 * anchor survived its own replacement and a second run appended the section a second time.
 *
 * These tests read the migration files themselves — no database, no production — and hold them to the
 * two rules that would have caught that: a rewrite must not be able to fire twice, and the latest
 * rewrite must describe the prompt the code actually seeds. Older files are allowed to disagree with
 * the seed, because a later migration has since rewritten what they wrote.
 */
const MIGRATIONS = path.resolve(__dirname, '../../packages/db/migrations');

type Rewrite = { file: string; index: number; old: string; fresh: string; statement: string };

function promptRewrites(): Rewrite[] {
  const found: Rewrite[] = [];
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^0\d{3}_.*default_agent.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      for (const match of statement.matchAll(
        /replace\("system_prompt", \$old(\d+)\$([\s\S]*?)\$old\1\$, \$new\1\$([\s\S]*?)\$new\1\$\)/g,
      )) {
        found.push({ file, index: Number(match[1]), old: match[2], fresh: match[3], statement });
      }
    }
  }
  return found;
}

describe('default_agent prompt migrations', () => {
  it('finds the rewrites it is meant to be guarding', () => {
    expect(promptRewrites().length).toBeGreaterThan(0);
  });

  it('no rewrite can fire twice: either its anchor goes away, or a WHERE guard stops the second run', () => {
    for (const { file, index, old, fresh, statement } of promptRewrites()) {
      const anchorGone = !fresh.includes(old);
      const guarded = /\bWHERE\b/i.test(statement);
      expect(
        anchorGone || guarded,
        `${file} span ${index}: "${old.trim().slice(0, 60)}…" is still inside the text that replaces it, `
        + 'so running the migration twice appends it again unless the statement carries a WHERE guard — '
        + 'this is exactly what 0024 did wrong and what production had to be repaired from.',
      ).toBe(true);
    }
  });

  it('the newest rewrite writes text the seeded prompt actually carries', () => {
    const rewrites = promptRewrites();
    const newest = rewrites[rewrites.length - 1].file;
    for (const { index, fresh } of rewrites.filter((r) => r.file === newest)) {
      expect(
        DEFAULT_AGENT_PROMPT.includes(fresh.trim()),
        `${newest} span ${index}: the migration writes "${fresh.trim().slice(0, 50)}…" but the seed in code does not contain it, so the row and the code disagree`,
      ).toBe(true);
    }
  });

  it('every span the seed carries was reached, so a code edit without a migration fails here', () => {
    // The live row is the seed plus the migrations. If someone edits DEFAULT_AGENT_PROMPT and forgets the
    // SQL, the newest migration no longer explains the seed's own headings — which is what this catches.
    const rewrites = promptRewrites();
    const newest = rewrites[rewrites.length - 1].file;
    const written = rewrites.filter((r) => r.file === newest).map((r) => r.fresh.trim());
    for (const heading of DEFAULT_AGENT_PROMPT.split('\n').filter((line) => line.startsWith('## '))) {
      const nearby = written.some((span) => span.includes(heading));
      const untouched = rewrites.every((r) => !r.old.includes(heading));
      expect(
        nearby || untouched,
        `the section "${heading}" exists in the seed but no migration accounts for it — either it was never written to the row, or it changed in code only`,
      ).toBe(true);
    }
  });
});
