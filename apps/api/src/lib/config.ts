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

/**
 * How many times one conversation's tail may re-trigger a follow-up run before
 * the chain itself is the story. Each re-trigger is a fresh invocation with a
 * 9 s handshake, so a runaway loop both spams the customer and never settles.
 */
export const RUN_LOOP_DEPTH_THRESHOLD = 5;
