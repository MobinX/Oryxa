type Fields = Record<string, unknown>;

/**
 * The API process registers a sink at startup; with none registered this package
 * logs nothing at all, so `@repo/integrations` stays a leaf that any caller can
 * import without dragging in the app's logging stack.
 */
export type IntegrationLogSink = (evt: 'http_out' | 'anomaly', fields: Fields) => void;

let sink: IntegrationLogSink | undefined;

export function setIntegrationLogSink(next: IntegrationLogSink | undefined): void {
  sink = next;
}

function report(evt: 'http_out' | 'anomaly', fields: Fields): void {
  try {
    sink?.(evt, fields);
  } catch {
    // An outbound call is never failed or slowed by its own instrumentation.
  }
}

function requestTarget(input: string | URL | Request): string | undefined {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Meta puts `access_token` in the query string and the page token appears in
 * every Graph URL, so only the host and path are ever reported.
 */
function describe(input: string | URL | Request, init?: RequestInit) {
  let host = 'unknown';
  let targetPath: string | undefined;
  const raw = requestTarget(input);
  if (raw) {
    try {
      const url = new URL(raw);
      host = url.host;
      targetPath = url.pathname;
    } catch {
      // An unparseable URL reports as much; the call itself still proceeds.
    }
  }
  const method =
    init?.method ?? (input instanceof Request ? input.method : undefined) ?? 'GET';
  return { host, targetPath, httpMethod: method.toUpperCase() };
}

function durationSince(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

/** `fetch` with one `evt=http_out` per call — same response, same rejections. */
export async function loggedFetch(
  input: string | URL | Request,
  init?: RequestInit,
  service = 'facebook',
): Promise<Response> {
  const target = describe(input, init);
  const started = performance.now();
  try {
    const res = await fetch(input, init);
    report('http_out', { ...target, service, status: res.status, ok: res.ok, durationMs: durationSince(started) });
    return res;
  } catch (err) {
    report('http_out', {
      ...target,
      service,
      ok: false,
      errorName: err instanceof Error ? err.name : 'Error',
      durationMs: durationSince(started),
    });
    throw err;
  }
}

/**
 * A Graph send that comes back an error is a customer who was not replied to, and
 * the HTTP status alone does not say why — the code/subcode pair is what separates
 * an expired token from the 24-hour window closing.
 */
export function logGraphSendFailure(status: number, code?: number, subcode?: number): void {
  const reason = code === undefined ? `HTTP ${status}` : `${code}:${subcode ?? 0}`;
  report('anomaly', { kind: 'graph_send_failed', detail: reason });
}

/** Reports a non-HTTP SDK call (presign, upload) with the same shape as a fetch. */
export async function loggedCall<T>(
  service: string,
  operation: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await work();
    report('http_out', { service, targetPath: operation, httpMethod: 'SDK', ok: true, durationMs: durationSince(started) });
    return result;
  } catch (err) {
    report('http_out', {
      service,
      targetPath: operation,
      httpMethod: 'SDK',
      ok: false,
      errorName: err instanceof Error ? err.name : 'Error',
      durationMs: durationSince(started),
    });
    throw err;
  }
}
