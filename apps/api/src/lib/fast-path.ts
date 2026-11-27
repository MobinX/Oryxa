/**
 * Zero-LLM Fast-Path — deterministic handlers for high-confidence template routes.
 * Runs before Agent instantiation to cut LLM cost to $0 on routine turns.
 */

import { spendQuotaUnit, refundQuotaUnit } from '@repo/db/crud/billing';
import { createMessage } from '@repo/db/crud/conversation';
import { listCategories, searchProducts, foldName } from '@repo/db/crud/product';
import { getOrdersByPlatformId } from '@repo/db/crud/order';
import { sendMessage, sendQuickReplies, detailsProductPayload, type MessengerCard } from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import {
  resolveDeliveryZone,
  detectTurnLanguage,
  PAYMENT_STRATEGY_LABELS,
  type PaymentMethodConfig,
  type PaymentStrategy,
  type DecisionResult,
} from '@repo/shared';

export interface FastPathContext {
  businessId: string;
  businessName: string;
  conversationId: string;
  customerPlatformId: string;
  customerText: string;
  pageToken: string;
  platform?: 'facebook' | 'instagram';
  deliveryZones?: Array<{ label: string; price: number }>;
  paymentMethods?: PaymentMethodConfig[];
  paymentStrategy?: PaymentStrategy;
  sendMessageOverride?: (token: string, psid: string, text: string) => Promise<void>;
}

export interface FastPathDecision {
  template_route: string;
  confidence: number;
  sales_stage?: string;
  ui_action?: string;
  quoteScore?: number;
}

export interface FastPathResult {
  handled: boolean;
  fastPath: boolean;
  totalTokens: number;
  replyText?: string;
  chips?: string[];
  chargedPeriod?: string | null;
}

const OBJECTION_STAGES = new Set(['price_objection', 'trust_objection']);
const HANDLED_ROUTES = new Set([
  'greeting_with_categories',
  'show_category_products',
  'show_delivery_charges',
  'show_payment_methods',
  'show_order_status',
]);

function pickRotating<T>(items: T[], seedText: string): T {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) | 0;
  return items[Math.abs(hash) % items.length]!;
}

export async function runFastPath(
  decision: FastPathDecision | DecisionResult,
  ctx: FastPathContext,
): Promise<FastPathResult> {
  const result: FastPathResult = { handled: false, fastPath: false, totalTokens: 0 };

  if (
    !decision ||
    decision.template_route === 'needs_llm_closer' ||
    decision.template_route === 'cannot_tell' ||
    !HANDLED_ROUTES.has(decision.template_route) ||
    (decision.confidence ?? 0) < 0.9 ||
    OBJECTION_STAGES.has(decision.sales_stage ?? '') ||
    (decision.quoteScore ?? 0) >= 0.5
  ) {
    return result;
  }

  const lang = detectTurnLanguage(ctx.customerText);
  const isBn = lang === 'bn';

  let replyText = '';
  let chips: string[] = [];
  let cardsToSend: MessengerCard[] = [];

  if (decision.template_route === 'greeting_with_categories') {
    const cats = await listCategories(ctx.businessId).catch(() => []);
    const catNames = cats.map((c) => c.name).filter(Boolean).slice(0, 3);
    if (catNames.length === 0) return result;
    replyText = isBn
      ? pickRotating(
          [
            `আসসালামু আলাইকুম! ${ctx.businessName}-এ স্বাগতম 😊 কোন ক্যাটাগরির প্রোডাক্ট দেখতে চান?`,
            `হ্যালো ভাই/আপু! ${ctx.businessName}-এ আপনাকে স্বাগতম ❤️ নিচের কোন কালেকশনটি দেখাব?`,
          ],
          ctx.customerText,
        )
      : pickRotating(
          [
            `Welcome to ${ctx.businessName}! 😊 Which category would you like to explore?`,
            `Hi there! Welcome to ${ctx.businessName}. Which collection can I show you?`,
          ],
          ctx.customerText,
        );
    chips = catNames;
  } else if (decision.template_route === 'show_category_products') {
    const cats = await listCategories(ctx.businessId).catch(() => []);
    const foldedText = foldName(ctx.customerText);
    const matchedCat = cats.find(
      (c) => foldedText.includes(foldName(c.name)) || foldName(c.name).includes(foldedText),
    );
    if (!matchedCat) return result;

    const prods = await searchProducts(ctx.businessId, '', 6, { categoryId: matchedCat.id }).catch(() => []);
    if (prods.length === 0) return result;

    for (const p of prods.slice(0, 5)) {
      const v = p.variants.find((x) => x.isAvailable && x.stock > 0 && (x.cardImageKey || x.imageUrl));
      const key = (p as any).cardImageKey || v?.cardImageKey || v?.imageUrl;
      const imageUrl = key ? await resolveStoredImageUrl(key).catch(() => null) : null;
      if (imageUrl) {
        cardsToSend.push({
          title: p.name.slice(0, 80),
          subtitle: `BDT ${p.price}`.slice(0, 80),
          imageUrl,
          button: { title: 'Order', payload: `place order with ${p.id} and ${p.name}` },
          extraButtons: [{ title: 'Details', payload: detailsProductPayload(p.id) }],
        });
      }
    }

    replyText = isBn
      ? `${matchedCat.name} কালেকশনের প্রোডাক্টগুলো দেখুন 😊 কোনটি পছন্দ হলে অর্ডার করতে পারেন!`
      : `Here are our ${matchedCat.name} items 😊 Tap Order on any product you like!`;
    chips = isBn ? ['অর্ডার করব', 'অন্য ক্যাটাগরি'] : ['Order Now', 'Other Categories'];
  } else if (decision.template_route === 'show_delivery_charges') {
    const zones = ctx.deliveryZones ?? [];
    if (zones.length === 0) return result;
    const resolved = resolveDeliveryZone(ctx.customerText, zones);
    if (resolved.status === 'resolved' && resolved.zone) {
      replyText = isBn
        ? `${resolved.zone.label} ডেলিভারি চার্জ BDT ${Number(resolved.zone.price).toFixed(0)}। অর্ডার করতে আপনার নাম, ফোন নম্বর ও ঠিকানা দিন 😊`
        : `Delivery to ${resolved.zone.label} is BDT ${Number(resolved.zone.price).toFixed(0)}. Share your name, phone, and address to order!`;
    } else {
      const list = zones.map((z) => `${z.label}: BDT ${Number(z.price).toFixed(0)}`).join(', ');
      replyText = isBn
        ? `আমাদের ডেলিভারি চার্জ: ${list}। আপনার এলাকা কোনটি?`
        : `Our delivery charges: ${list}. Which area are you in?`;
      chips = zones.slice(0, 3).map((z) => z.label.slice(0, 20));
    }
  } else if (decision.template_route === 'show_payment_methods') {
    const methods = ctx.paymentMethods ?? [];
    const strategyLabel = PAYMENT_STRATEGY_LABELS[ctx.paymentStrategy ?? 'cod'];
    const methodLine = methods.length
      ? methods.map((m) => `${m.name}${m.info ? ` (${m.info})` : ''}`).join(', ')
      : '';
    replyText = isBn
      ? `আমাদের পেমেন্ট সিস্টেম: ${strategyLabel}।${methodLine ? ` পেমেন্ট নম্বর: ${methodLine}।` : ''} কোনভাবে অর্ডার করতে চান?`
      : `Payment options: ${strategyLabel}.${methodLine ? ` Accounts: ${methodLine}.` : ''} How would you like to proceed?`;
    chips = isBn ? ['Cash on Delivery', ...methods.slice(0, 2).map((m) => m.name.slice(0, 20))] : ['Cash on Delivery', ...methods.slice(0, 2).map((m) => m.name.slice(0, 20))];
  } else if (decision.template_route === 'show_order_status') {
    const ordersRes = await getOrdersByPlatformId(ctx.businessId, ctx.customerPlatformId, { limit: 3 }).catch(() => ({ orders: [] }));
    if (ordersRes.orders.length === 0) {
      replyText = isBn
        ? 'আপনার কোনো পূর্ববর্তী অর্ডার পাওয়া যায়নি। নতুন অর্ডার করতে চাইলে প্রোডাক্টের নাম বলুন 😊'
        : 'No previous orders found under your account. Let me know which product you would like to order!';
    } else {
      const latest = ordersRes.orders[0]!;
      replyText = isBn
        ? `আপনার সর্বশেষ অর্ডার (${latest.productName ?? 'Order'} x${latest.count}, মোট BDT ${latest.totalPrice.toFixed(0)}) বর্তমানে "${latest.state}" অবস্থায় আছে।`
        : `Your latest order (${latest.productName ?? 'Order'} x${latest.count}, total BDT ${latest.totalPrice.toFixed(0)}) is currently "${latest.state}".`;
    }
  }

  if (!replyText) return result;

  // Spend quota atomically before sending
  let chargedPeriod: string | null = null;
  if (!ctx.sendMessageOverride) {
    try {
      const budget = await spendQuotaUnit(ctx.businessId, 'message');
      if (budget.spent) chargedPeriod = budget.period;
      else return result;
    } catch {
      /* fail open */
    }
  }

  try {
    if (ctx.sendMessageOverride) {
      await ctx.sendMessageOverride(ctx.pageToken, ctx.customerPlatformId, replyText);
    } else {
      if (cardsToSend.length > 0) {
        await sendMessage(ctx.pageToken, ctx.customerPlatformId, cardsToSend, { platform: ctx.platform });
      }
      if (chips.length > 0 && (!ctx.platform || ctx.platform === 'facebook')) {
        await sendQuickReplies(ctx.pageToken, ctx.customerPlatformId, replyText, chips.slice(0, 3), {
          platform: ctx.platform,
        });
      } else {
        await sendMessage(ctx.pageToken, ctx.customerPlatformId, replyText, { platform: ctx.platform });
      }
    }

    await createMessage({
      conversationId: ctx.conversationId,
      from: 'self',
      content: replyText,
      state: 'done',
    }).catch(() => {});

    result.handled = true;
    result.fastPath = true;
    result.replyText = replyText;
    result.chips = chips;
    result.chargedPeriod = chargedPeriod;
    return result;
  } catch (err) {
    if (chargedPeriod) {
      try {
        await refundQuotaUnit(ctx.businessId, 'message', chargedPeriod);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

export const executeFastPath = runFastPath;
export const fastPath = runFastPath;
