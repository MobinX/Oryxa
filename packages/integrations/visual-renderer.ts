import type { MessengerCard } from './facebook';
import {
  buildWhatsAppVisualPayload,
  type WhatsAppCarouselCardInput,
} from './whatsapp';

export type VisualChannel = 'facebook' | 'messenger' | 'instagram' | 'whatsapp' | 'web' | 'flutter';

export interface VisualProductCardItem {
  productId: string;
  variantId?: string | null;
  title: string;
  subtitle: string;
  priceText?: string;
  imageUrl: string;
  orderPayload: string;
  detailsPayload?: string;
  stockCount?: number;
}

export interface VisualResponseBundle {
  leadText?: string;
  cards?: VisualProductCardItem[];
  quickReplies?: string[];
}

export type RenderedVisualResponse =
  | {
      channel: 'facebook' | 'messenger';
      cards: MessengerCard[];
      quickReplies: string[];
      leadText?: string;
    }
  | {
      channel: 'instagram';
      cards: MessengerCard[];
      leadText: string;
      quickReplies: string[];
    }
  | {
      channel: 'whatsapp';
      mode: 'single_image_buttons' | 'carousel' | 'text_only';
      payload: Record<string, unknown> | null;
      leadText?: string;
      quickReplies: string[];
    }
  | {
      channel: 'web' | 'flutter';
      leadText?: string;
      cards: VisualProductCardItem[];
      quickReplies: string[];
    };

function oneLine(value: string | null | undefined, limit: number): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function normalizeChips(chips?: string[]): string[] {
  return (chips ?? [])
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((c) => Array.from(c).slice(0, 20).join(''));
}

function toMessengerCards(cards: VisualProductCardItem[]): MessengerCard[] {
  return cards.slice(0, 10).map((item) => ({
    title: oneLine(item.title, 80),
    subtitle: oneLine(item.subtitle || item.priceText || '', 80),
    imageUrl: item.imageUrl,
    button: { title: 'Order', payload: item.orderPayload },
    ...(item.detailsPayload
      ? { extraButtons: [{ title: 'Details', payload: item.detailsPayload }] }
      : {}),
  }));
}

function buildInstagramLeadText(cards: VisualProductCardItem[], explicitLeadText?: string): string {
  if (explicitLeadText?.trim()) return explicitLeadText.trim();
  if (cards.length === 0) return '';
  return cards
    .slice(0, 5)
    .map((c, idx) => `${idx + 1}. ${oneLine(c.title, 48)}${c.priceText ? ` - ${c.priceText}` : ''}`)
    .join('\n');
}

/**
 * Single channel-aware presentation adapter enforcing platform limits across
 * Messenger, Instagram DM, WhatsApp Cloud API (with mandatory 1-card guard),
 * and Web/Flutter native cards.
 */
export function renderVisualResponse(
  channel: VisualChannel,
  bundle: VisualResponseBundle,
  options: { recipientId?: string } = {},
): RenderedVisualResponse {
  const cards = (bundle.cards ?? []).slice(0, 10);
  const quickReplies = normalizeChips(bundle.quickReplies);

  if (channel === 'facebook' || channel === 'messenger') {
    return {
      channel,
      cards: toMessengerCards(cards),
      quickReplies,
      ...(bundle.leadText?.trim() ? { leadText: bundle.leadText.trim() } : {}),
    };
  }

  if (channel === 'instagram') {
    return {
      channel: 'instagram',
      cards: toMessengerCards(cards),
      leadText: buildInstagramLeadText(cards, bundle.leadText),
      quickReplies,
    };
  }

  if (channel === 'whatsapp') {
    const waCards: WhatsAppCarouselCardInput[] = cards.map((item) => ({
      imageUrl: item.imageUrl,
      bodyText: oneLine(`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ''}`, 160),
      buttonTitle: 'Order',
      buttonPayload: item.orderPayload,
    }));

    const recipient = options.recipientId || 'recipient';
    const extraButtons = cards.length === 1 && cards[0]?.detailsPayload
      ? [{ id: cards[0].detailsPayload, title: 'Details' }]
      : [];

    const payload = buildWhatsAppVisualPayload(
      recipient,
      waCards,
      oneLine(bundle.leadText || 'Select a product below:', 160),
      extraButtons,
    );

    const mode = waCards.length === 0
      ? 'text_only'
      : waCards.length === 1
        ? 'single_image_buttons'
        : 'carousel';

    return {
      channel: 'whatsapp',
      mode,
      payload,
      ...(bundle.leadText?.trim() ? { leadText: bundle.leadText.trim() } : {}),
      quickReplies,
    };
  }

  return {
    channel,
    ...(bundle.leadText?.trim() ? { leadText: bundle.leadText.trim() } : {}),
    cards,
    quickReplies,
  };
}
