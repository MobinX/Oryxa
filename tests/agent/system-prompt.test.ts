import { describe, expect, it } from 'vitest';
import {
  CATALOG_CATEGORY_INSTRUCTIONS,
  COMMENT_AGENT_GUIDANCE,
  CORE_AGENT_PROMPT,
  MESSENGER_AGENT_GUIDANCE,
  PAYMENT_TRANSACTION_INSTRUCTIONS,
  SUGGESTION_TOOL_INSTRUCTIONS,
} from '@repo/shared';
import { createAgentTools } from '@agent/tools';
import { createCommentAgentTools } from '@agent/tools/comment';

/**
 * The v007 system prompt carries behavioral rules that name tools. If the prompt names a tool
 * that does not exist — or a tool is renamed without updating the prompt — the agent plans
 * around phantom capabilities. These tests hold every tool reference in the prompts to the
 * factories' actual names, and pin the non-negotiable v007 rules so a later edit cannot
 * silently drop one.
 */

/** Every tool the prompts may name, taken from the factories themselves (no DB touched). */
function actualToolNames(): Set<string> {
  const messenger = createAgentTools({
    businessId: 'prompt-test',
    conversationId: 'prompt-test',
    pageToken: 'prompt-test',
    customerPlatformId: 'prompt-test',
  });
  const comment = createCommentAgentTools({
    businessId: 'prompt-test',
    commentThreadId: 'prompt-test',
    pageToken: 'prompt-test',
    parentCommentExternalId: 'prompt-test',
  });
  return new Set([...messenger, ...comment].map((t) => t.name));
}

/**
 * Backticked identifiers that look like tool names but are not: `find_categories` is the
 * catalog helper the suggestion block has always pointed at alongside the Catalog Summary.
 * Everything else snake_case in backticks must be a real tool.
 */
const NON_TOOL_IDENTIFIERS = new Set(['find_categories']);

/**
 * Leading `snake_case` identifier of every backticked span, e.g. `show_products(query=...)`.
 * The name must end in a letter or digit, so a glob like `show_*` reads as `show` (not a
 * reference) instead of the phantom tool `show_`.
 */
function referencedIdentifiers(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(/`([a-z][a-z0-9_]*[a-z0-9])/g)) {
    if (match[1].includes('_')) found.add(match[1]);
  }
  return [...found];
}

describe('v007 system prompt', () => {
  it('keeps the shared instruction blocks verbatim inside the core prompt', () => {
    expect(CORE_AGENT_PROMPT).toContain(SUGGESTION_TOOL_INSTRUCTIONS);
    expect(CORE_AGENT_PROMPT).toContain(CATALOG_CATEGORY_INSTRUCTIONS);
    expect(CORE_AGENT_PROMPT).toContain(PAYMENT_TRANSACTION_INSTRUCTIONS);
  });

  it.each([
    ['language contract (Banglish/Bangla -> Bengali script)', 'Banglish input (Bengali in Latin letters) -> reply in শুদ্ধ বাংলা'],
    ['language contract (English -> English)', 'English input -> reply in English, NEVER in Bangla'],
    ['grounding from tool results', 'ONLY from current-turn tool results'],
    ['no payment verification from screenshot/TrxID', 'A screenshot or a TrxID is NOT payment verification'],
    ['typed TrxID before create_order', 'a typed TrxID is required before `create_order`'],
    ['COD separate flow', 'Cash on delivery (COD) is a separate flow'],
    ['COD total with delivery charge', 'show the full total including the delivery charge'],
    ['overpayment scam guard', 'never instruct them to send or resend money'],
    ['human-handoff gating on reported=true', 'unless `report_human_intervene` actually returned `reported=true`'],
    ['variant no-guess', 'Never guess a size, color, or variant'],
    ['SILENT after chip/message sends', 'end your turn with the single word SILENT'],
    ['discount honesty', 'possible / to be confirmed by the team'],
    ['no refund promises', 'Never promise refunds, exchanges, or replacements'],
  ])('keeps %s prominent', (_label, phrase) => {
    expect(CORE_AGENT_PROMPT).toContain(phrase);
  });

  it.each([
    ['CORE_AGENT_PROMPT', CORE_AGENT_PROMPT],
    ['MESSENGER_AGENT_GUIDANCE', MESSENGER_AGENT_GUIDANCE],
    ['COMMENT_AGENT_GUIDANCE', COMMENT_AGENT_GUIDANCE],
  ])('%s names only tools that exist', (_label, prompt) => {
    const actual = actualToolNames();
    for (const id of referencedIdentifiers(prompt)) {
      expect(
        actual.has(id) || NON_TOOL_IDENTIFIERS.has(id),
        `\`${id}\` is referenced by the prompt but no factory builds a tool with that name`,
      ).toBe(true);
    }
  });

  it('gates the Messenger handoff row on reported=true', () => {
    expect(MESSENGER_AGENT_GUIDANCE).toContain('Only when it returns `reported: true`');
    expect(MESSENGER_AGENT_GUIDANCE).toContain('with no promise of contact');
  });
});
