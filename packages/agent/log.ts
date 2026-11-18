/**
 * A leaf sink for the agent package's own operational events.
 *
 * The logger lives in the API app (it owns the Axiom token and the field allowlist),
 * and `@repo/agent` must stay importable from places that have no logging stack — a
 * unit test, a script, the playground. The app registers the sink once at startup,
 * exactly like `@repo/integrations/http-log` does for Graph calls; with no sink
 * registered nothing is logged and no run is slowed by its own instrumentation.
 */
export type AgentLogEvent = 'product_info';

export type AgentLogSink = (evt: AgentLogEvent, fields: Record<string, unknown>) => void;

let sink: AgentLogSink | undefined;

export function setAgentLogSink(next: AgentLogSink | undefined): void {
  sink = next;
}

/** Emit one `evt=product_info` (or a future agent event) through the registered sink. */
export function agentLog(evt: AgentLogEvent, fields: Record<string, unknown>): void {
  try {
    sink?.(evt, fields);
  } catch {
    // A broken log sink must never break the answer a customer is waiting for.
  }
}
