import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import { seedTestWorld } from '../helpers/seed';

const getPageIdForTokenMock = vi.fn(async (..._args: unknown[]): Promise<string | null> => 'PAGE_FROM_TOKEN');
const sendTextMock = vi.fn(async (..._args: unknown[]) => undefined);
const verifyWaMock = vi.fn(async (..._args: unknown[]) => ({ verified: true as boolean, error: undefined as string | undefined }));

vi.mock('@repo/integrations/facebook', async () => {
  const actual = await import('@repo/integrations/facebook');
  return {
    ...actual,
    getPageIdForToken: (...args: unknown[]) => getPageIdForTokenMock(...args),
  };
});

vi.mock('@repo/integrations/whatsapp', () => ({
  sendWhatsAppText: (...args: unknown[]) => sendTextMock(...args),
  verifyWhatsAppPhoneNumber: (...args: unknown[]) => verifyWaMock(...args),
  markWhatsAppRead: vi.fn(async () => undefined),
  sendWhatsAppTemplate: vi.fn(async () => undefined),
}));

const bearer = () => ({ Authorization: `Bearer ${logsOperatorPassword()}` });

/**
 * Health check (spec A): "never show connected unless verified against the API" — the
 * stored channel is only verified when the platform recognizes the token AND the identity
 * the token resolves to is the one the channel stores.
 */
describe('admin AI channel verify', () => {
  withPglite();
  beforeEach(() => {
    getPageIdForTokenMock.mockClear().mockImplementation(async (): Promise<string | null> => 'PAGE_FROM_TOKEN');
    verifyWaMock.mockClear().mockImplementation(async (..._args: unknown[]) => ({ verified: true, error: undefined }));
  });

  it('facebook: verified only when the token resolves to the connected page id', async () => {
    const seed = await seedTestWorld();

    getPageIdForTokenMock.mockImplementation(async () => seed.pageChannelId);
    const okRes = await app.request(`http://localhost/api2/admin/ai/channels/${seed.channel.id}/verify`, { headers: bearer() });
    expect((await okRes.json()) as { verified: boolean }).toMatchObject({ verified: true });

    getPageIdForTokenMock.mockImplementation(async () => 'SOME_OTHER_PAGE');
    const mismatch = await app.request(`http://localhost/api2/admin/ai/channels/${seed.channel.id}/verify`, { headers: bearer() });
    const body = (await mismatch.json()) as { verified: boolean; error?: string };
    expect(body.verified).toBe(false);
    expect(body.error).toContain('SOME_OTHER_PAGE');
    expect(body.error).toContain(seed.pageChannelId);

    getPageIdForTokenMock.mockImplementation(async () => null);
    const broken = await app.request(`http://localhost/api2/admin/ai/channels/${seed.channel.id}/verify`, { headers: bearer() });
    expect(((await broken.json()) as { verified: boolean }).verified).toBe(false);
  });

  it('whatsapp: delegates to the phone-number verify and reports it verbatim', async () => {
    const { syncUser } = await import('@repo/db/crud/user');
    const { createBusiness } = await import('@repo/db/crud/business');
    const { createAgent, createChannel } = await import('@repo/db/crud/channel');
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await syncUser({ firebaseUid: `wv-${suffix}`, name: 'WV', email: `wv-${suffix}@oryxa.dev`, signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: `WV ${suffix}`, hasTradeLicense: false, hasTaxLicense: false });
    const agent = await createAgent(business.id, { name: 'WV Bot', systemPrompt: 'x', platformType: 'whatsapp' });
    const channel = await createChannel(business.id, {
      platform: 'whatsapp',
      apiToken: 't',
      platformChannelId: `WA_${suffix}`,
      agentId: agent.id,
    });

    verifyWaMock.mockImplementation(async () => ({ verified: false, error: 'token expired' }));
    const res = await app.request(`http://localhost/api2/admin/ai/channels/${channel.id}/verify`, { headers: bearer() });
    expect(res.status).toBe(200);
    expect((await res.json()) as { verified: boolean; error: string }).toMatchObject({
      verified: false,
      error: 'token expired',
    });
  });
});
