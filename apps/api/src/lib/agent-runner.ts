import { runAgentCore } from '@api/lib/agent-runner-core';
import { outboundRunHeaders } from '@api/lib/ctx';
import { quotaGate, type TriggerOptions, type TriggerVerdict } from '@api/lib/quota';
import { TRIGGER_TIMEOUT_MS } from './config';

const AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'dev-internal-key';

export async function triggerAgentRun(
  conversationId: string,
  options: TriggerOptions = {},
): Promise<TriggerVerdict> {
  // Checked before the POST, not inside the runner: a run that cannot reply still costs
  // a full LLM turn, and the customer hears nothing either way.
  const verdict = await quotaGate('message', conversationId, options);
  if (verdict === 'blocked') return verdict;

  fetch(`${AGENT_RUNNER_URL}/internal/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
      ...outboundRunHeaders(),
    },
    body: JSON.stringify({ conversationId }),
  }).catch((err) => console.error('Failed to trigger agent run:', err));

  await new Promise((resolve) => setTimeout(resolve, TRIGGER_TIMEOUT_MS));
  return verdict;
}

/** Production entry-point: no SSE, no overrides, real Facebook send. */
export async function runAgentForConversation(conversationId: string): Promise<void> {
  return runAgentCore(conversationId, {});
}
