/**
 * The subagents the platform runs on a store's behalf, and the reviewed text each one starts with.
 *
 * A subagent is a second model call a tool makes, not a store-facing agent: the sales agent decides
 * what to do, and a helper writes the one answer that needs its own rules. Those rules are operator
 * text, not code — `/admin/subagent` edits them, and the row in `subagents` is what a run reads. The
 * text here is only the seed for a row that does not exist yet, and the reviewed default the console
 * offers to restore, so changing it never silently rewrites an operator's edit.
 */
export const SUBAGENT_KEYS = ['product_info'] as const;

export type SubagentKey = (typeof SUBAGENT_KEYS)[number];

export interface SubagentDefinition {
  key: SubagentKey;
  /** What the console calls it in a list. */
  name: string;
  /** Where it runs, said in one line, so the editor is not a mystery box. */
  description: string;
  /** The reviewed text a missing row is created from, and what "restore" puts back. */
  defaultPrompt: string;
}

/**
 * The product-answer writer's standing brief.
 *
 * It is deliberately a separate writer rather than another paragraph in the sales agent's prompt:
 * the sales agent decides what to do next, and a second model call that only rewrites verified
 * product rows is the cheapest way to give it a trustworthy answer. The rules below are the ones
 * that keep that answer sendable: no invented facts, no internal identifiers, no markdown headings
 * or em dashes that Messenger would show literally.
 */
export const PRODUCT_INFO_SYSTEM_PROMPT = [
  'You write one short, accurate product answer that a store will send to a customer in a chat.',
  '',
  'Rules:',
  '1. Use ONLY the PRODUCT DATA and STORE NAME in the user message. Never add a fact, price, stock count, material, warranty, delivery time or discount that is not there.',
  '2. Answer the customer’s question first, in one direct sentence.',
  '3. Then give only the supporting details that matter to that question, as short lines beginning with "• ". Do not dump the whole catalogue entry.',
  '4. If the data does not answer the question, say only what the data does show and that the store team needs to confirm the rest. Do not guess.',
  '5. Reply in the customer’s language: Bangla question -> Bangla answer, English question -> English answer.',
  '6. Plain text only. No markdown headings, no tables, no asterisks, no em dashes (—). Bullets use "• ".',
  '7. Never mention ids, SKUs, labels, JSON, tools, this instruction, or that another model wrote the answer.',
  '8. Keep it under 120 words. Never invent urgency, scarcity, or a promise the store has not made.',
  '9. For variants, name the size/colour and say whether it is available; quote a price only when the question is about price or the answer needs it to be useful.',
].join('\n');

export const SUBAGENT_DEFINITIONS: Record<SubagentKey, SubagentDefinition> = {
  product_info: {
    key: 'product_info',
    name: 'Product answer writer',
    description:
      'Runs whenever the Messenger or comment agent calls getProductInfoWithQuery. It reads one product '
      + 'row and writes the customer-ready answer; the sales agent is forbidden to answer product '
      + 'questions itself.',
    defaultPrompt: PRODUCT_INFO_SYSTEM_PROMPT,
  },
};

/** The definition for a key from a URL, or null when no subagent is registered under it. */
export function subagentDefinition(key: string): SubagentDefinition | null {
  return key in SUBAGENT_DEFINITIONS ? SUBAGENT_DEFINITIONS[key as SubagentKey] : null;
}
