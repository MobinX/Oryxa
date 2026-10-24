import type { MessengerCard, MessagingPlatform } from '@repo/integrations/facebook';
import {
  sendMessage,
  detailsProductPayload,
} from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import { getProductById, searchProducts } from '@repo/db/crud/product';
import { createMessage, getConversationForBusiness } from '@repo/db/crud/conversation';
import { cardsAsText } from '@repo/agent';
import type { z } from 'zod';
import type { sendSuggestionInputSchema } from '@repo/shared';

type SendInput = z.infer<typeof sendSuggestionInputSchema>;

const taka = (value: number) => `৳${value.toFixed(0)}`;

function description(product: { description: string | null }): string {
  return (product.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

type CardProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  variants: Array<{
    price?: string | number | null;
    isAvailable: boolean;
    stock: number;
    imageUrl?: string | null;
  }>;
};

function priceOf(product: CardProduct): number {
  const inStock = product.variants
    .filter((variant) => variant.isAvailable && variant.stock > 0)
    .map((variant) => parseFloat(String(variant.price ?? '')))
    .filter(Number.isFinite);
  return inStock.length ? Math.min(...inStock) : parseFloat(String(product.price)) || 0;
}

async function cardFor(product: CardProduct): Promise<MessengerCard | null> {
  const variant =
    product.variants.find((v) => v.imageUrl && v.isAvailable && v.stock > 0) ??
    product.variants.find((v) => v.imageUrl) ??
    null;
  if (!variant?.imageUrl) return null;
  const imageUrl = await resolveStoredImageUrl(variant.imageUrl).catch(() => null);
  if (!imageUrl) return null;
  const price = taka(priceOf(product));
  const summary = description(product);
  return {
    title: product.name.slice(0, 60),
    subtitle: summary ? `${price} — ${summary}` : price,
    imageUrl,
    button: { title: 'Details', payload: detailsProductPayload(product.id) },
  };
}

/**
 * Sends a suggestion the merchant tapped. Only product and category cards come through
 * here: text replies go through the normal composer, and order cards are deliberately
 * not part of the suggestion vocabulary.
 */
export async function sendSuggestionAsCards(
  businessId: string,
  conversationId: string,
  input: SendInput,
): Promise<{ cards: number }> {
  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv?.channel) throw new Error('Conversation not found');

  const platform: MessagingPlatform = conv.channel.platform === 'instagram' ? 'instagram' : 'facebook';
  const cards: MessengerCard[] = [];

  if (input.kind === 'product') {
    if (!input.productId) throw new Error('productId is required');
    const product = await getProductById(businessId, input.productId);
    const card = product ? await cardFor(product) : null;
    if (card) cards.push(card);
  } else {
    if (!input.categoryId) throw new Error('categoryId is required');
    const rows = await searchProducts(businessId, '', 8, { categoryId: input.categoryId });
    for (const product of rows) {
      if (product.variants.length > 0 && !product.variants.some((v) => v.isAvailable && v.stock > 0)) {
        continue;
      }
      const card = await cardFor(product);
      if (!card) continue;
      cards.push(card);
      if (cards.length === 4) break;
    }
  }

  if (cards.length === 0) throw new Error('Nothing in this suggestion can be sent as a card');

  await sendMessage(conv.channel.apiToken, conv.customerPlatformId, cards, {
    platform,
    humanAgent: true,
  });
  await createMessage({
    conversationId,
    from: 'self',
    content: cardsAsText(cards),
    state: 'done',
    sentBy: 'human',
  });

  return { cards: cards.length };
}
