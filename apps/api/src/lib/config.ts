/**
 * Configuration constants for the API application.
 */
export const TRIGGER_TIMEOUT_MS = 9000;

/**
 * If a conversation or comment thread has been in `working` or `pending` state
 * for longer than this threshold (ms), the prior agent runner is assumed to be
 * dead (crashed / Vercel timeout / cold-start race) and a fresh run is kicked
 * off to recover it. Set to 35 s — well above the typical LLM round-trip but
 * short enough to recover before a customer notices silence.
 */
export const STALE_RUNNER_MS = 35_000;
