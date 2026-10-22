import { describe, it, expect, vi, beforeEach } from 'vitest';

// api.ts imports `redirect` from next/navigation, which must not load in node;
// a real call would also throw NEXT_REDIRECT, so the stub is only a tripwire.
const redirectMock = vi.fn((path: string) => {
  const e = new Error(`NEXT_REDIRECT: ${path}`);
  (e as { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  throw e;
});

vi.mock('next/navigation', () => ({ redirect: (path: string) => redirectMock(path) }));

import { ApiError, syncUser } from '../../apps/web/lib/api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const PROFILE = {
  firebaseUid: 'uid-1',
  name: 'Test User',
  email: 'user@example.com',
  signInMethod: 'google',
};

describe('web syncUser (apps/web/lib/api.ts)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    redirectMock.mockClear();
  });

  it('sends the Firebase bearer on POST /api/v1/users/sync', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'u1' }), { status: 200 }));
    await syncUser('id-token-1', PROFILE);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/api/v1/users/sync')).toBe(true);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token-1');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('throws instead of redirecting when the API returns 401 (signInPath: null)', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );
    await expect(syncUser('stale-or-forged', PROFILE)).rejects.toBeInstanceOf(ApiError);
    await expect(syncUser('stale-or-forged', PROFILE)).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
