import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  readAxiomStorage,
  retentionFrom,
  storageAllowance,
  storageUsageFromAudit,
  usageDatasetName,
  __testOnly,
} from '@api/lib/log-storage';

const auditRow = (time: string, dataset: string, bytes: number) => ({
  _time: time,
  data: { properties: { dataset, compressed_bytes: bytes } },
});

describe('Axiom storage readings', () => {
  it('reads the dataset name out of the audit id', () => {
    expect(usageDatasetName('oryxa-vaaa.app.El0k61Ta')).toBe('app');
    expect(usageDatasetName('app')).toBe('app');
  });

  it('keeps the newest row per dataset and ignores malformed ones', () => {
    const usage = storageUsageFromAudit([
      auditRow('2026-10-23T02:00:00Z', 'org.app.abc', 950),
      auditRow('2026-10-22T02:00:00Z', 'org.app.abc', 700),
      auditRow('2026-10-23T02:00:00Z', 'org.other.xyz', 300),
      { _time: '2026-10-23T02:00:00Z', data: { properties: { dataset: 'org.bad.xyz', compressed_bytes: 'x' } } },
      { nope: true },
    ]);

    expect(usage).toEqual([
      { name: 'app', bytes: 950, measuredAt: '2026-10-23T02:00:00Z' },
      { name: 'other', bytes: 300, measuredAt: '2026-10-23T02:00:00Z' },
    ]);
  });

  it('computes a rolling expiry only when retention is on', () => {
    const on = retentionFrom(
      { retentionDays: 30, useRetentionPeriod: true },
      '2026-09-01T00:00:00.000Z',
    );
    expect(on.retentionEnabled).toBe(true);
    expect(on.retentionKnown).toBe(true);
    expect(on.expiresAt).toBe('2026-10-01T00:00:00.000Z');

    const off = retentionFrom({ retentionDays: 0, useRetentionPeriod: false }, '2026-09-01T00:00:00.000Z');
    expect(off.retentionEnabled).toBe(false);
    expect(off.expiresAt).toBeNull();
  });

  describe('allowance', () => {
    const previous = process.env.AXIOM_STORAGE_LIMIT_GB;

    afterEach(() => {
      if (previous === undefined) delete process.env.AXIOM_STORAGE_LIMIT_GB;
      else process.env.AXIOM_STORAGE_LIMIT_GB = previous;
    });

    it('falls back to the Axiom always-free 100 GB', () => {
      delete process.env.AXIOM_STORAGE_LIMIT_GB;
      expect(storageAllowance()).toEqual({ limitGb: 100, configured: false });
      process.env.AXIOM_STORAGE_LIMIT_GB = '0';
      expect(storageAllowance()).toEqual({ limitGb: 100, configured: false });
    });

    it('uses a configured paid-plan allowance', () => {
      process.env.AXIOM_STORAGE_LIMIT_GB = '250';
      expect(storageAllowance()).toEqual({ limitGb: 250, configured: true });
    });
  });
});

describe('readAxiomStorage', () => {
  const previous = {
    enabled: process.env.AXIOM_ENABLED,
    ingest: process.env.AXIOM_TOKEN,
    query: process.env.AXIOM_QUERY_TOKEN,
    dataset: process.env.AXIOM_DATASET,
    limit: process.env.AXIOM_STORAGE_LIMIT_GB,
  };

  beforeEach(() => {
    __testOnly.resetCache();
    process.env.AXIOM_ENABLED = '1';
    process.env.AXIOM_TOKEN = 'test-ingest';
    process.env.AXIOM_QUERY_TOKEN = 'test-query';
    process.env.AXIOM_DATASET = 'app';
    delete process.env.AXIOM_STORAGE_LIMIT_GB;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __testOnly.resetCache();
    for (const [key, value] of Object.entries({
      AXIOM_ENABLED: previous.enabled,
      AXIOM_TOKEN: previous.ingest,
      AXIOM_QUERY_TOKEN: previous.query,
      AXIOM_DATASET: previous.dataset,
      AXIOM_STORAGE_LIMIT_GB: previous.limit,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reports used, left and the retention date from Axiom', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url.endsWith('/v1/datasets/app')) {
        return new Response(JSON.stringify({ retentionDays: 30, useRetentionPeriod: true }), { status: 200 });
      }
      if (url.includes('/v1/datasets/_apl')) {
        if (body.apl.includes('Storage usage calculated')) {
          return new Response(
            JSON.stringify({
              matches: [
                auditRow('2026-10-23T02:00:00Z', 'org.app.abc', 2_000_000_000),
                auditRow('2026-10-23T02:00:00Z', 'org.other.xyz', 500_000_000),
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ matches: [{ _time: '2026-10-01T00:00:00.000Z' }] }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const storage = await readAxiomStorage();

    expect(storage.available).toBe(true);
    expect(storage.usedGb).toBe(2.5);
    expect(storage.remainingGb).toBe(97.5);
    expect(storage.percentUsed).toBe(2.5);
    expect(storage.limitGb).toBe(100);
    expect(storage.limitConfigured).toBe(false);
    expect(storage.logDataset).toMatchObject({
      name: 'app',
      bytes: 2_000_000_000,
      retentionDays: 30,
      retentionEnabled: true,
      retentionKnown: true,
      expiresAt: '2026-10-31T00:00:00.000Z',
    });
    expect(storage.datasets).toHaveLength(2);
  });

  it('still returns retention when the audit query fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith('/v1/datasets/app')) {
          return new Response(JSON.stringify({ retentionDays: 0, useRetentionPeriod: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: 'nope' }), { status: 403 });
      }),
    );

    const storage = await readAxiomStorage();

    expect(storage.available).toBe(false);
    expect(storage.usedGb).toBeNull();
    expect(storage.note).toContain('did not report storage usage');
    expect(storage.logDataset.retentionKnown).toBe(true);
    expect(storage.logDataset.retentionEnabled).toBe(false);
  });
});
