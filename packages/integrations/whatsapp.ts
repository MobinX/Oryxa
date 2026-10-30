import { loggedFetch } from './http-log';

/**
 * The WhatsApp Cloud API side of a channel (spec A): the smallest set of Graph v21 calls
 * the client needs — send a free-text message, reply to a received one, send a registered
 * template, and verify the token belongs to a phone number the operator pasted.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';
/** WhatsApp free-text limit; a Threads-like answer must be chunked the same way. */
export const WHATSAPP_TEXT_LIMIT = 4096;

export type WhatsAppSendError = {
  ok: false;
  status: number;
  code?: number;
  subcode?: number;
  error?: string;
  errorUserMsg?: string;
  errorUserTitle?: string;
};

/** 24 media types WhatsApp accepts; only image/sticker need these now. */
export type WhatsAppMediaLinkMessage = {
  type: 'image' | 'sticker';
  link: string;
};

function chunkText(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const split = rest.lastIndexOf('\n', limit);
    const cut = split > limit * 0.4 ? split : limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

export function whatsappChunks(text: string): string[] {
  return chunkText(text);
}

/** Transient-looking failures are worth one immediate retry (spec G: outbound retry). */
const RETRYABLE_STATUS = (status: number) => status === 429 || status >= 500;

async function postWhatsApp(token: string, phoneNumberId: string, payload: unknown) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rawPostWhatsApp(token, phoneNumberId, payload);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (attempt >= 1 || !RETRYABLE_STATUS(status ?? 0)) throw err;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 300 * 2 ** attempt)));
    }
  }
}

async function rawPostWhatsApp(token: string, phoneNumberId: string, payload: unknown) {
  const res = await loggedFetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  }, 'whatsapp');
  if (!res.ok) {
    let body: { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string; error_user_title?: string } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* a non-JSON error body is still an error */
    }
    const err = {
      ok: false as const,
      status: res.status,
      code: body.error?.code,
      subcode: body.error?.error_subcode,
      error: body.error?.message,
      errorUserMsg: body.error?.error_user_msg,
      errorUserTitle: body.error?.error_user_title,
    };
    console.error('whatsapp_send_failed', JSON.stringify(err));
    throw Object.assign(new Error(err.error ?? `WhatsApp send failed (HTTP ${res.status})`), err);
  }
}

/** A plain outbound text — the 24-hour free-form window cases. */
export async function sendWhatsAppText(
  token: string,
  phoneNumberId: string,
  to: string,
  content: string,
  replyToMessageId?: string,
): Promise<void> {
  for (const chunk of chunkText(content)) {
    await postWhatsApp(token, phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: chunk },
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    });
  }
}

/**
 * An outbound template (spec A onboarding media/template): the only legal way to open a
 * WhatsApp conversation for no client-initiated message. `bodyParams` fills the template's
 * {{1}}, {{2}} slots in order.
 */
export async function sendWhatsAppTemplate(
  token: string,
  phoneNumberId: string,
  to: string,
  template: {
    name: string;
    language: string;
    bodyParams?: string[];
  },
): Promise<void> {
  await postWhatsApp(token, phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: [
        {
          type: 'body',
          parameters: (template.bodyParams ?? []).map((text) => ({ type: 'text', text })),
        },
      ],
    } as never,
  });
}

/** Marks an inbound message read — the double tick the customer sees turn blue. */
export async function markWhatsAppRead(token: string, phoneNumberId: string, messageId: string): Promise<void> {
  await postWhatsApp(token, phoneNumberId, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/**
 * True when the pasted token can actually drive the Phone Number ID it claims — the
 * connect step before the channel is trusted. Reads the number identity with the token.
 */
export async function verifyWhatsAppPhoneNumber(
  token: string,
  phoneNumberId: string,
): Promise<{
  verified: boolean;
  displayPhoneNumber?: string;
  verifiedName?: string;
  error?: string;
}> {
  const res = await loggedFetch(
    `${GRAPH_API}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`,
    {},
    'whatsapp',
  );
  if (!res.ok) {
    return { verified: false, error: `HTTP ${res.status}` };
  }
  const body = (await res.json()) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  return {
    verified: true,
    displayPhoneNumber: body.display_phone_number,
    verifiedName: body.verified_name,
  };
}
