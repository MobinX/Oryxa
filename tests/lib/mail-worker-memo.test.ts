import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureMailbox } from '../../apps/api/src/lib/mail-worker';

const MAILBOX = { id: 'mbx-1', address: 'op@onlyorders.tech', name: 'Op' };

function mockWorkerOk() {
  return vi.fn(async () => new Response(JSON.stringify({ mailbox: MAILBOX }), { status: 200 }));
}

describe('ensureMailbox memo', () => {
  beforeEach(() => {
    vi.stubEnv('MAIL_WORKER_URL', 'https://mail.test');
    vi.stubEnv('MAIL_WORKER_API_KEY', 'test-key');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('collapses concurrent ensures into one Worker POST', async () => {
    const fetchMock = mockWorkerOk();
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([
      ensureMailbox('concurrent@onlyorders.tech'),
      ensureMailbox('concurrent@onlyorders.tech'),
    ]);
    expect(a).toEqual(MAILBOX);
    expect(b).toEqual(MAILBOX);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves repeat ensures from memo within TTL', async () => {
    const fetchMock = mockWorkerOk();
    vi.stubGlobal('fetch', fetchMock);
    await ensureMailbox('memo@onlyorders.tech');
    await ensureMailbox('memo@onlyorders.tech');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the memo TTL expires', async () => {
    const fetchMock = mockWorkerOk();
    vi.stubGlobal('fetch', fetchMock);
    await ensureMailbox('ttl@onlyorders.tech');
    vi.advanceTimersByTime(61_000);
    await ensureMailbox('ttl@onlyorders.tech');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not memoize failures', async () => {
    vi.stubEnv('MAIL_WORKER_MAX_ATTEMPTS', '1');
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(ensureMailbox('fail@onlyorders.tech')).rejects.toThrow();
    await expect(ensureMailbox('fail@onlyorders.tech')).rejects.toThrow();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
