import type { MessengerCard, MessagingPlatform } from '@repo/integrations/facebook';
import {
  sendMessage,
  detailsProductPayload,
  detailsVariantPayload,
} from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import {
  getProductById,
  searchProducts,
} from '@repo/db/crud/product';
import { getOrderById } from '@repo/db/crud/order';
import { createMessage, getConversationForBusiness } from '@repo/db/crud/conversation';
import { cardsAsText } from '@repo/agent';
import type { z } from 'zod';
import type { sendSuggestionInputSchema } from '@repo/shared';

type SendInput = z.infer<typeof sendSuggestionInputSchema>;

/** Messenger's generic template carries at most ten cards per message. */
const CARD_CHUNK = 10;
const LIST_LIMIT = 15;

const taka = (value: number) => `৳${value.toFixed(0)}`;

type CardProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  variants: Array<{
    id: string;
    name: string;
    price?: string | number | null;
    isAvailable: boolean;
    stock: number;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
  }>;
};

function description(product: CardProduct): string {
  return (product.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

function priceOf(product: CardProduct, variant?: CardProduct['variants'][number]): number {
  if (variant?.price != null && Number.isFinite(parseFloat(String(variant.price)))) {
    return parseFloat(String(variant.price));
  }
  const inStock = product.variants
    .filter((item) => item.isAvailable && item.stock > 0)
    .map((item) => parseFloat(String(item.price ?? '')))
    .filter(Number.isFinite);
  return inStock.length ? Math.min(...inStock) : parseFloat(String(product.price)) || 0;
}

function sellable(product: CardProduct): boolean {
  return (
    product.variants.length === 0 ||
    product.variants.some((variant) => variant.isAvailable && variant.stock > 0)
  );
}

function firstPhoto(product: CardProduct) {
  return (
    product.variants.find((v) => v.imageUrl && v.isAvailable && v.stock > 0) ??
    product.variants.find((v) => v.imageUrl) ??
    null
  );
}

async function productCard(product: CardProduct): Promise<MessengerCard | null> {
  const photo = firstPhoto(product);
  const imageUrl = photo?.imageUrl
    ? await resolveStoredImageUrl(photo.imageUrl).catch(() => null)
    : null;
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

async function infoCards(product: CardProduct): Promise<MessengerCard[]> {
  const cards: MessengerCard[] = [];
  for (const variant of product.variants) {
    if (!variant.isAvailable || variant.stock <= 0 || !variant.imageUrl) continue;
    const imageUrl = await resolveStoredImageUrl(variant.imageUrl).catch(() => null);
    if (!imageUrl) continue;
    cards.push({
      title: `${product.name} — ${variant.name}`.slice(0, 60),
      subtitle: `${taka(priceOf(product, variant))} · ${variant.stock} in stock`,
      imageUrl,
      button: { title: 'Details', payload: detailsVariantPayload(product.id, variant.id) },
    });
  }
  return cards;
}

async function variantPhotoCards(
  product: CardProduct,
  variant: CardProduct['variants'][number],
): Promise<MessengerCard[]> {
  const stored = variant.imageUrls?.length
    ? variant.imageUrls
    : variant.imageUrl
      ? [variant.imageUrl]
      : [];
  const urls = (
    await Promise.all(stored.map((key) => resolveStoredImageUrl(key).catch(() => null)))
  ).filter((url): url is string => Boolean(url));

  const price = taka(priceOf(product, variant));
  const total = urls.length;
  return urls.slice(0, CARD_CHUNK).map((imageUrl, index) => ({
    title: `${product.name} — ${variant.name}`.slice(0, 60),
    subtitle:
      total > 1
        ? `${price} · ${variant.stock} in stock · photo ${index + 1}/${total}`
        : `${price} · ${variant.stock} in stock`,
    imageUrl,
    button: { title: 'Details', payload: detailsVariantPayload(product.id, variant.id) },
  }));
}

async function orderCard(order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>): Promise<MessengerCard | null> {
  const imageUrl = order.variantImageUrl;
  if (!imageUrl) return null;
  const stateLabel =
    order.state === 'onDelivery' ? 'On delivery' : order.state.charAt(0).toUpperCase() + order.state.slice(1);
  return {
    title: `${order.count} × ${order.productName ?? 'your order'}`.slice(0, 60),
    subtitle: `${stateLabel} · ${taka(order.totalPrice)} · ${order.createdAt.toISOString().slice(0, 10)}`,
    imageUrl,
    button: order.productId
      ? { title: 'Details', payload: detailsProductPayload(order.productId) }
      : { title: 'Track order', payload: `please track order with id ${order.id}` },
  };
}

async function deliverCards(
  conversationId: string,
  platform: MessagingPlatform,
  pageToken: string,
  customerPlatformId: string,
  cards: MessengerCard[],
): Promise<number> {
  if (cards.length === 0) return 0;
  for (let index = 0; index < cards.length; index += CARD_CHUNK) {
    const chunk = cards.slice(index, index + CARD_CHUNK);
    await sendMessage(pageToken, customerPlatformId, chunk, { platform, humanAgent: true });
    await createMessage({
      conversationId,
      from: 'self',
      content: cardsAsText(chunk),
      state: 'done',
      sentBy: 'human',
    });
  }
  return cards.length;
}

/**
 * Sends a card set the merchant picked in the composer. Mirrors the agent display tools:
 * a product list (15), every in-stock variant of one product, every photo of one variant,
 * or one existing order card. Text replies keep going through the normal composer.
 */
export async function sendSuggestionAsCards(
  businessId: string,
  conversationId: string,
  input: SendInput,
): Promise<{ cards: number }> {
  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv?.channel) throw new Error('Conversation not found');

  const platform: MessagingPlatform = conv.channel.platform === 'instagram' ? 'instagram' : 'facebook';
  let cards: MessengerCard[] = [];

  if (input.kind === 'product') {
    if (!input.productId) throw new Error('productId is required');
    const product = await getProductById(businessId, input.productId);
    const card = product ? await productCard(product) : null;
    if (card) cards.push(card);
  } else if (input.kind === 'category' || input.kind === 'product_list') {
    const rows = await searchProducts(businessId, '', LIST_LIMIT, {
      categoryId: input.categoryId ?? null,
    });
    for (const product of rows) {
      if (!sellable(product)) continue;
      const card = await productCard(product);
      if (card) cards.push(card);
    }
  } else if (input.kind === 'product_info') {
    if (!input.productId) throw new Error('productId is required');
    const product = await getProductById(businessId, input.productId);
    if (product) cards = await infoCards(product);
  } else if (input.kind === 'product_variant') {
    if (!input.productId) throw new Error('productId is required');
    if (!input.variantId) throw new Error('variantId is required');
    const product = await getProductById(businessId, input.productId);
    const variant = product?.variants.find((item) => item.id === input.variantId);
    if (product && variant) cards = await variantPhotoCards(product, variant);
  } else if (input.kind === 'order_card') {
    if (!input.orderId) throw new Error('orderId is required');
    const order = await getOrderById(businessId, input.orderId);
    const card = order ? await orderCard(order) : null;
    if (card) cards.push(card);
  }

  if (cards.length === 0) throw new Error('Nothing in this selection can be sent as a card');

  const sent = await deliverCards(
    conversationId,
    platform,
    conv.channel.apiToken,
    conv.customerPlatformId,
    cards,
  );
  return { cards: sent };
}
