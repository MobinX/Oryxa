import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import { sendWhatsAppText, WHATSAPP_TEXT_LIMIT } from '@repo/integrations/whatsapp';

const bearer = () => ({ Authorization: `Bearer ${logsOperatorPassword()}` });

describe('outbound retry (spec G)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a transient 5xx once, and again refuses non-transient errors immediately', async () => {
    // 500 then 200: the send succeeds on attempt 2.
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ message_id: 'wamid1' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message_id: 'wamid2' }), { status: 200 }));
    await sendWhatsAppText('tok', 'num', '44999', 'hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 403 (permanent) — no retry: caller sees the error on the first attempt.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'no window' } }), { status: 403 }),
    );
    await expect(sendWhatsAppText('tok', 'num', '44999', 'hi')).rejects.toThrow('no window');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Chunked text: every chunk gets its own transient-retry budget.
    fetchMock.mockClear();
    const long = 'a'.repeat(WHATSAPP_TEXT_LIMIT + 10);
    fetchMock
      .mockResolvedValueOnce(new Response('{"message_id":"1"}', { status: 502 }))
      .mockResolvedValueOnce(new Response('{"message_id":"2"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"message_id":"3"}', { status: 200 }));
    await sendWhatsAppText('tok', 'num', '44999', long);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('admin disconnect (spec A)', () => {
  withPglite();

  it('soft-deletes a business channel; webhook lookups then miss it', async () => {
    const { syncUser } = await import('@repo/db/crud/user');
    const { createBusiness } = await import('@repo/db/crud/business');
    const { createAgent, createChannel, findChannelByPlatformAccountId } = await import('@repo/db/crud/channel');
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await syncUser({ firebaseUid: `dc-${suffix}`, name: 'DC', email: `dc-${suffix}@oryxa.dev`, signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: `DC ${suffix}`, hasTradeLicense: false, hasTaxLicense: false });
    const agent = await createAgent(business.id, { name: 'DC Bot', systemPrompt: 'x', platformType: 'whatsapp' });
    const channel = await createChannel(business.id, {
      platform: 'whatsapp',
      apiToken: 't',
      platformChannelId: `WA_DC_${suffix}`,
      agentId: agent.id,
    });

    expect(await findChannelByPlatformAccountId('whatsapp', `WA_DC_${suffix}`)).not.toBeNull();

    const res = await app.request(`http://localhost/api2/admin/ai/channels/${channel.id}/disconnect`, {
      method: 'POST',
      headers: bearer(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { disconnected: boolean }).toMatchObject({ disconnected: true });

    expect(await findChannelByPlatformAccountId('whatsapp', `WA_DC_${suffix}`)).toBeNull();

    const again = await app.request(`http://localhost/api2/admin/ai/channels/${channel.id}/disconnect`, {
      method: 'POST',
      headers: bearer(),
    });
    expect(again.status).toBe(404);
  });
});
