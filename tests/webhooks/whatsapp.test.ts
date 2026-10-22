import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import { createAgent, createChannel } from '@repo/db/crud/channel';
import { hmacSha256Hex } from '@repo/integrations/crypto';
import { flushBackground } from '@api/lib/background';
import { app } from '@api/app';

process.env.WHATSAPP_APP_SECRET = 'test-wa-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-wa-verify-token';

const triggerAgentRunMock = vi.fn();
vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: (...args: unknown[]) => triggerAgentRunMock(...args),
  runAgentForConversation: vi.fn(),
}));

const markReadMock = vi.fn(async (..._args: unknown[]) => undefined);
const sendTextMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/whatsapp', () => ({
  markWhatsAppRead: (...args: unknown[]) => markReadMock(...args),
  sendWhatsAppText: (...args: unknown[]) => sendTextMock(...args),
  sendWhatsAppTemplate: vi.fn(async () => undefined),
  verifyWhatsAppPhoneNumber: vi.fn(async () => true),
}));


async function seedWaWorld(): Promise<{
  business: Awaited<ReturnType<typeof createBusiness>>;
  channel: { id: string; platformChannelId: string };
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await syncUser({
    firebaseUid: `wa-test-${suffix}`,
    name: 'WA Test User',
    email: `wa-${suffix}@oryxa.dev`,
    signInMethod: 'google',
  });
  const business = await createBusiness(user.id, {
    name: `WA Store ${suffix}`,
    description: 'A test store for the WhatsApp webhook',
    hasTradeLicense: false,
    hasTaxLicense: false,
  });
  const agent = await createAgent(business.id, {
    name: 'WA Bot',
    systemPrompt: 'You help customers.',
    platformType: 'whatsapp',
  });
  const phoneNumberId = `WA_NUM_${crypto.randomUUID()}`;
  const channel = await createChannel(business.id, {
    platform: 'whatsapp',
    apiToken: 'wa-token-test',
    platformChannelId: phoneNumberId,
    agentId: agent.id,
  });
  return { business, channel: { id: channel.id, platformChannelId: phoneNumberId } };
}

function waPayload(
  phoneNumberId: string,
  senderId: string,
  externalId: string,
  text: string,
  extra: Partial<Record<string, unknown>> = {},
): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '15551234567' },
              contacts: [{ wa_id: senderId, profile: { name: 'WA Customer' } }],
              messages: [{ from: senderId, id: externalId, type: 'text', text: { body: text } }],
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

/** Signs the raw payload the way Meta does, then delivers it. */
async function deliver(payload: unknown, signatureOverride?: string): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signatureOverride !== null) {
    const sig = signatureOverride ?? `sha256=${hmacSha256Hex(process.env.WHATSAPP_APP_SECRET!, body)}`;
    headers['x-hub-signature-256'] = sig;
  }
  const res = await app.request('http://localhost/webhooks/whatsapp', { method: 'POST', headers, body });
  await flushBackground();
  return res;
}

const externalId = (slot: string) => `WAMID_${slot}_${Math.random().toString(36).slice(2, 10)}`;

describe('WhatsApp webhook', () => {
  withPglite();

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = 'test-wa-app-secret';
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-wa-verify-token';
    delete process.env.WHATSAPP_SIGNATURE_MODE;
    triggerAgentRunMock.mockClear();
    markReadMock.mockClear();
    sendTextMock.mockClear();
  });

  afterEach(() => {
    delete process.env.WHATSAPP_SIGNATURE_MODE;
  });

  it('GET handshake: wrong token is 403, the right one echoes the challenge', async () => {
    const bad = await app.request(
      'http://localhost/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ch1',
    );
    expect(bad.status).toBe(403);

    const good = await app.request(
      'http://localhost/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-wa-verify-token&hub.challenge=ch-affle-42',
    );
    expect(good.status).toBe(200);
    expect(await good.text()).toBe('ch-affle-42');
  });

  it('POST: invalid signature is rejected in enforce mode', async () => {
    const world = await seedWaWorld();
    const res = await deliver(waPayload(world.channel.platformChannelId, '95001', externalId('sig'), 'hi'), 'sha256=deadbeef');
    expect(res.status).toBe(403);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('POST: log-only mode tolerates a bad signature but records it', async () => {
    process.env.WHATSAPP_SIGNATURE_MODE = 'log-only';
    const world = await seedWaWorld();
    const res = await deliver(waPayload(world.channel.platformChannelId, '95001', externalId('lo'), 'hi'), 'sha256=deadbeef');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');
  });

  it('persists a text message, triggers the agent, and dedupes on the message id', async () => {
    const world = await seedWaWorld();
    const sender = '95002';
    const id = externalId('d1');
    const payload = waPayload(world.channel.platformChannelId, sender, id, 'Do you deliver to Dhaka?');

    const first = await deliver(payload);
    expect(first.status).toBe(200);
    expect(triggerAgentRunMock.mock.calls.length).toBeGreaterThan(0);

    // One trigger per inserted message: the call's conversation id is real.
    const conversationId = triggerAgentRunMock.mock.calls[0][0] as string;
    expect(typeof conversationId).toBe('string');

    // Re-delivery of the identical payload (Meta retries): dedupe, no second trigger.
    triggerAgentRunMock.mockClear();
    const second = await deliver(payload);
    expect(second.status).toBe(200);
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
    expect(id).not.toBe(conversationId);
  });

  it('STOP opts out and acks without an AI reply; START opts back in', async () => {
    const world = await seedWaWorld();
    const sender = '95003';

    const stop = await deliver(waPayload(world.channel.platformChannelId, sender, externalId('s1'), 'STOP'));
    expect(stop.status).toBe(200);
    await vi.waitFor(() => {
      expect(sendTextMock).toHaveBeenCalled();
    });
    expect(sendTextMock.mock.calls[0][3]).toContain('opted out');

    sendTextMock.mockClear();
    const start = await deliver(waPayload(world.channel.platformChannelId, sender, externalId('s2'), 'start'));
    expect(start.status).toBe(200);
    await vi.waitFor(() => {
      expect(sendTextMock).toHaveBeenCalled();
    });
    expect(sendTextMock.mock.calls[0][3]).toContain('opted back in');
  });

  it('media content: acked, never fabricated into a reply, no agent trigger', async () => {
    const world = await seedWaWorld();
    const sender = '95004';
    const res = await deliver({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: world.channel.platformChannelId },
                messages: [{ from: sender, id: externalId('m1'), type: 'image', image: { id: 'IMG1' } }],
              },
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(sendTextMock).not.toHaveBeenCalled();
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(markReadMock).toHaveBeenCalled();
    });
  });

  it('unknown phone_number_id: acked and skipped, no processing', async () => {
    const res = await deliver(waPayload('UNKNOWN_NUM', '95005', externalId('u1'), 'hello'));
    expect(res.status).toBe(200);
    expect(sendTextMock).not.toHaveBeenCalled();
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('malformed bodies: 400 for bad JSON and unhandled object types', async () => {
    const raw = JSON.stringify(waPayload('x', 'y', 'z', 'hello'));
    const sig = `sha256=${hmacSha256Hex(process.env.WHATSAPP_APP_SECRET!, '{"nope"')}`;
    const badJson = await app.request('http://localhost/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
      body: '{"nope"',
    });
    expect(badJson.status).toBe(400);

    const wrongObject = JSON.stringify({ object: 'other_type', entry: [] });
    const wrongSig = `sha256=${hmacSha256Hex(process.env.WHATSAPP_APP_SECRET!, wrongObject)}`;
    const badShape = await app.request('http://localhost/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': wrongSig },
      body: wrongObject,
    });
    expect(badShape.status).toBe(400);
    void raw;
  });
});
