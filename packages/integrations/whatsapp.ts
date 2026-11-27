import { loggedFetch } from './http-log';

/**
 * The WhatsApp Cloud API side of a channel (spec A): the smallest set of Graph v21 calls
 * the client needs — send a free-text message, reply to a received one, send a registered
 * template, send interactive visual cards/buttons, and verify the token belongs to a phone number.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';
/** WhatsApp free-text limit; a Threads-like answer must be chunked the same way. */
export const WHATSAPP_TEXT_LIMIT = 4096;
export const WHATSAPP_CAROUSEL_BODY_LIMIT = 160;
export const WHATSAPP_BUTTON_TITLE_LIMIT = 20;

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

export type WhatsAppCarouselCardInput = {
  imageUrl: string;
  bodyText: string;
  buttonTitle: string;
  buttonPayload: string;
};

export type WhatsAppInteractiveButtonInput = {
  id: string;
  title: string;
};

function clipText(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

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

/**
 * Builds either a WhatsApp Interactive Media Carousel (2-10 cards) OR, when only 1 card matches,
 * safely auto-downgrades to a Single Image + Interactive Reply Buttons payload (Meta's API rejects
 * 1-card carousels).
 */
export function buildWhatsAppVisualPayload(
  to: string,
  cards: WhatsAppCarouselCardInput[],
  headerBodyText = 'Choose an option below:',
  extraButtons: WhatsAppInteractiveButtonInput[] = [],
): Record<string, unknown> | null {
  if (cards.length === 0) return null;

  if (cards.length === 1) {
    const single = cards[0]!;
    const buttons = [
      {
        type: 'reply',
        reply: {
          id: single.buttonPayload.slice(0, 256),
          title: clipText(single.buttonTitle || 'Order', WHATSAPP_BUTTON_TITLE_LIMIT),
        },
      },
      ...extraButtons.slice(0, 2).map((b) => ({
        type: 'reply',
        reply: {
          id: b.id.slice(0, 256),
          title: clipText(b.title, WHATSAPP_BUTTON_TITLE_LIMIT),
        },
      })),
    ];

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'image',
          image: { link: single.imageUrl },
        },
        body: {
          text: clipText(single.bodyText || headerBodyText, WHATSAPP_CAROUSEL_BODY_LIMIT),
        },
        action: {
          buttons,
        },
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: {
        text: clipText(headerBodyText, WHATSAPP_CAROUSEL_BODY_LIMIT),
      },
      action: {
        cards: cards.slice(0, 10).map((card, index) => ({
          card_index: index,
          type: 'cta_url',
          header: {
            type: 'image',
            image: { link: card.imageUrl },
          },
          body: {
            text: clipText(card.bodyText, WHATSAPP_CAROUSEL_BODY_LIMIT),
          },
          action: {
            name: 'quick_reply',
            parameters: {
              display_text: clipText(card.buttonTitle || 'Order', WHATSAPP_BUTTON_TITLE_LIMIT),
              payload: card.buttonPayload.slice(0, 256),
            },
          },
        })),
      },
    },
  };
}

/** Sends a WhatsApp interactive media carousel (2-10 cards) or single-card image+buttons fallback. */
export async function sendWhatsAppCarousel(
  token: string,
  phoneNumberId: string,
  to: string,
  cards: WhatsAppCarouselCardInput[],
  headerBodyText?: string,
  extraButtons?: WhatsAppInteractiveButtonInput[],
): Promise<void> {
  const payload = buildWhatsAppVisualPayload(to, cards, headerBodyText, extraButtons);
  if (!payload) return;
  await postWhatsApp(token, phoneNumberId, payload);
}

/** Sends a single WhatsApp interactive reply-buttons message (optional image header). */
export async function sendWhatsAppInteractiveButtons(
  token: string,
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: WhatsAppInteractiveButtonInput[],
  imageUrl?: string,
): Promise<void> {
  const cleaned = buttons.slice(0, 3).map((b) => ({
    type: 'reply',
    reply: {
      id: b.id.slice(0, 256),
      title: clipText(b.title, WHATSAPP_BUTTON_TITLE_LIMIT),
    },
  }));
  if (cleaned.length === 0) {
    await sendWhatsAppText(token, phoneNumberId, to, bodyText);
    return;
  }
  await postWhatsApp(token, phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(imageUrl ? { header: { type: 'image', image: { link: imageUrl } } } : {}),
      body: { text: clipText(bodyText, 1024) },
      action: { buttons: cleaned },
    },
  });
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
