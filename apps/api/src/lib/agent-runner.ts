import { runAgentCore } from '@api/lib/agent-runner-core';

const AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'dev-internal-key';

export function triggerAgentRun(conversationId: string): void {
  fetch(`${AGENT_RUNNER_URL}/internal/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify({ conversationId }),
  }).catch((err) => console.error('Failed to trigger agent run:', err));
}

/** Production entry-point: no SSE, no overrides, real Facebook send. */
export async function runAgentForConversation(conversationId: string): Promise<void> {
  return runAgentCore(conversationId, {});
}
