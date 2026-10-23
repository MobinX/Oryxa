import type { AxiomLogRetention, AxiomStorageResponse } from '@repo/shared';
import { logDataset, logsToAxiom } from './log';
import { logQuerySource, queryToken } from './log-query';

const AXIOM_API = 'https://api.axiom.co';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Axiom's always-free storage allowance; a paid org can override it. */
const FREE_STORAGE_GB = 100;
const USAGE_WINDOW_DAYS = 14;
const CACHE_TTL_MS = 5 * 60 * 1000;

type Fields = Record<string, unknown>;

export type StorageUsage = { name: string; bytes: number; measuredAt: string };

type DatasetMeta = { retentionDays: number; useRetentionPeriod: boolean };

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `org.dataset.hash` is how Axiom's audit rows name a dataset. */
export function usageDatasetName(id: string): string {
  const parts = id.split('.');
  return parts.length >= 3 ? parts[1] : id;
}

/**
 * Storage is calculated once a day and reported as one audit row per dataset,
 * so the newest row wins and older rows for the same dataset are ignored.
 */
export function storageUsageFromAudit(matches: unknown[]): StorageUsage[] {
  const latest = new Map<string, StorageUsage>();

  for (const match of matches) {
    if (!isRecord(match)) continue;
    const time = typeof match._time === 'string' ? match._time : undefined;
    const data = isRecord(match.data) ? match.data : undefined;
    const properties = data && isRecord(data.properties) ? data.properties : undefined;
    if (!time || !properties) continue;

    const rawId = typeof properties.dataset === 'string' ? properties.dataset : undefined;
    const bytes = typeof properties.compressed_bytes === 'number' ? properties.compressed_bytes : undefined;
    if (!rawId || bytes === undefined || !Number.isFinite(bytes)) continue;

    const name = usageDatasetName(rawId);
    const current = latest.get(name);
    if (!current || Date.parse(time) > Date.parse(current.measuredAt)) {
      latest.set(name, { name, bytes, measuredAt: time });
    }
  }

  return [...latest.values()].sort((a, b) => b.bytes - a.bytes);
}

/**
 * Retention is a rolling window: the oldest event still stored leaves exactly
 * `retentionDays` after it was written. A dataset with retention off has no
 * expiry at all, so it is reported as such rather than given a made-up date.
 */
export function retentionFrom(
  meta: DatasetMeta,
  oldestEventAt: string | null,
): Omit<AxiomLogRetention, 'name' | 'bytes'> {
  const days = Number.isFinite(meta.retentionDays) && meta.retentionDays > 0
    ? Math.trunc(meta.retentionDays)
    : 0;
  const retentionEnabled = Boolean(meta.useRetentionPeriod && days > 0);
  const oldestMs = oldestEventAt ? Date.parse(oldestEventAt) : Number.NaN;
  const expiresAt =
    retentionEnabled && Number.isFinite(oldestMs)
      ? new Date(oldestMs + days * DAY_MS).toISOString()
      : null;

  return { retentionDays: days, retentionEnabled, retentionKnown: true, oldestEventAt, expiresAt };
}

/** A paid org can name its real allowance; otherwise the free-plan number is shown as a default. */
export function storageAllowance(): { limitGb: number; configured: boolean } {
  const raw = process.env.AXIOM_STORAGE_LIMIT_GB?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return { limitGb: parsed, configured: true };
  return { limitGb: FREE_STORAGE_GB, configured: false };
}

function aplDataset(name: string): string {
  return `['${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

async function axiomFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${AXIOM_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
}

async function axiomQuery(token: string, apl: string, startTime: string, endTime: string): Promise<unknown[]> {
  const res = await axiomFetch('/v1/datasets/_apl?format=legacy', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apl, startTime, endTime }),
  });
  if (!res.ok) throw new Error(`Axiom query answered ${res.status}`);
  const payload = (await res.json()) as { matches?: unknown[] };
  return payload.matches ?? [];
}

async function datasetMeta(token: string, name: string): Promise<DatasetMeta> {
  const res = await axiomFetch(`/v1/datasets/${encodeURIComponent(name)}`, token);
  if (!res.ok) throw new Error(`Axiom dataset metadata answered ${res.status}`);
  const payload = (await res.json()) as Fields;
  return {
    retentionDays: typeof payload.retentionDays === 'number' ? payload.retentionDays : 0,
    useRetentionPeriod: payload.useRetentionPeriod === true,
  };
}

async function oldestEvent(token: string, name: string, startTime: string, endTime: string): Promise<string | null> {
  const matches = await axiomQuery(token, `${aplDataset(name)} | sort by _time asc | limit 1`, startTime, endTime);
  const first = matches[0];
  return isRecord(first) && typeof first._time === 'string' ? first._time : null;
}

let cached: { key: string; at: number; value: AxiomStorageResponse } | undefined;

/** Kept short: storage moves once a day, and a page load should not query Axiom twice. */
export const __testOnly = {
  resetCache() {
    cached = undefined;
  },
};

export async function readAxiomStorage(): Promise<AxiomStorageResponse> {
  const dataset = logDataset();
  const allowance = storageAllowance();
  const key = `${dataset}:${allowance.limitGb}`;
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const value = await readUncached(dataset, allowance);
  cached = { key, at: Date.now(), value };
  return value;
}

async function readUncached(
  dataset: string,
  allowance: { limitGb: number; configured: boolean },
): Promise<AxiomStorageResponse> {
  const now = new Date();
  const emptyRetention: AxiomLogRetention = {
    name: dataset,
    bytes: null,
    retentionDays: 0,
    retentionEnabled: false,
    retentionKnown: false,
    oldestEventAt: null,
    expiresAt: null,
  };
  const base: AxiomStorageResponse = {
    source: logQuerySource(),
    available: false,
    usedBytes: null,
    usedGb: null,
    limitGb: allowance.limitGb,
    limitConfigured: allowance.configured,
    remainingGb: null,
    percentUsed: null,
    measuredAt: null,
    datasets: [],
    logDataset: emptyRetention,
  };

  if (!logsToAxiom()) {
    return { ...base, note: 'Axiom is not the log store here; this process is holding the events itself.' };
  }

  const token = queryToken();
  if (!token) {
    return { ...base, note: 'No Axiom query token is configured, so storage usage cannot be read.' };
  }

  const notes: string[] = [];

  let usages: StorageUsage[] | null = null;
  try {
    const matches = await axiomQuery(
      token,
      "['axiom-audit'] | where message == 'Storage usage calculated' | sort by _time desc | limit 100",
      new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS).toISOString(),
      now.toISOString(),
    );
    usages = storageUsageFromAudit(matches);
  } catch {
    notes.push('Axiom did not report storage usage.');
  }

  let meta: DatasetMeta | null = null;
  try {
    meta = await datasetMeta(token, dataset);
  } catch {
    notes.push('The dataset metadata could not be read, so retention is unknown.');
  }

  let retention = emptyRetention;
  if (meta) {
    const retentionEnabled = meta.useRetentionPeriod && meta.retentionDays > 0;
    let oldest: string | null = null;
    if (retentionEnabled) {
      try {
        oldest = await oldestEvent(
          token,
          dataset,
          new Date(now.getTime() - meta.retentionDays * DAY_MS).toISOString(),
          now.toISOString(),
        );
      } catch {
        notes.push('The oldest retained event could not be read.');
      }
    }
    retention = { name: dataset, bytes: null, ...retentionFrom(meta, oldest) };
  }

  if (usages === null) {
    return {
      ...base,
      logDataset: retention,
      ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    };
  }

  const usedBytes = usages.reduce((sum, entry) => sum + entry.bytes, 0);
  const usedGb = Number((usedBytes / 1_000_000_000).toFixed(4));
  const remainingGb = Number(Math.max(0, allowance.limitGb - usedGb).toFixed(4));
  const percentUsed = allowance.limitGb > 0
    ? Number(Math.min(100, (usedGb / allowance.limitGb) * 100).toFixed(2))
    : null;
  const measuredAt = usages.reduce<string | null>(
    (latest, entry) => (latest === null || Date.parse(entry.measuredAt) > Date.parse(latest) ? entry.measuredAt : latest),
    null,
  );
  const logBytes = usages.find((entry) => entry.name === dataset)?.bytes ?? null;

  return {
    ...base,
    available: true,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    usedBytes,
    usedGb,
    remainingGb,
    percentUsed,
    measuredAt,
    datasets: usages,
    logDataset: { ...retention, bytes: logBytes },
  };
}
