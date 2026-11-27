/**
 * OnlyOrders — Composite Business Tools
 *
 * Consolidates multi-step granular operations into single-pass business functions:
 * 1. browse_catalog: Consolidated catalog search, category discovery, filtering, and card presentation.
 * 2. get_product_quote: End-to-end pricing, variant resolution, stock check, delivery fee, and payment quote.
 * 3. place_order: Transactional checkout execution with stock, payment, and duplicate guards.
 * 4. get_order_status: Complete order lifecycle tracking, history, and parcel delivery status.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  searchProducts,
  countSearchResults,
  getProductByVariantId,
  getProductById,
  findCategories,
  listCategories,
  matchVariant,
  foldName,
} from '@repo/db/crud/product';
import { createOrder, getOrderById, getOrdersByPlatformId } from '@repo/db/crud/order';
import { createMessage } from '@repo/db/crud/conversation';
import { createBusinessNotification } from '@repo/db/crud/notification';
import { spendQuotaUnit, refundQuotaUnit } from '@repo/db/crud/billing';
import {
  sendMessage as fbSendMessage,
  sendButtons as fbSendButtons,
  detailsProductPayload,
  type MessagingPlatform,
  type MessengerCard,
} from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import type { SseEmitter } from '@agent/Agent';
import type { ConversationAgentState, PaymentMethodConfig, PaymentStrategy } from '@repo/shared';
import {
  matchPaymentMethod,
  checkOrderPayment,
  resolvePaymentStrategy,
  PAYMENT_STRATEGY_DESCRIPTIONS,
  PAYMENT_STRATEGY_LABELS,
  upfrontAmount,
  upfrontKind,
  parseVariantAttributes,
  resolveDeliveryZone,
} from '@repo/shared';

const CARD_LIST_LIMIT = 10;

function oneLine(value: string | null | undefined, limit: number): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function money(value: string | number | null | undefined, currency = 'BDT'): string {
  const amount = typeof value === 'number' ? value : parseFloat(value ?? '');
  if (!Number.isFinite(amount)) return '';
  const code = (currency || 'BDT').toUpperCase();
  return code === 'USD' ? `$${amount.toFixed(2)}` : `${code} ${amount.toFixed(2)}`;
}

function stateWord(state: string): string {
  const words: Record<string, string> = {
    pending: 'Pending',
    acknowledged: 'Acknowledged',
    onDelivery: 'On delivery',
    on_delivery: 'On delivery',
    done: 'Done',
  };
  return words[state] ?? state;
}

export interface CompositeToolsContext {
  businessId: string;
  conversationId?: string;
  pageToken?: string;
  customerPlatformId?: string;
  customerName?: string | null;
  platform?: MessagingPlatform;
  emitSse?: SseEmitter;
  sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>;
  onOrderCreated?: (order: { id: string; totalPrice: string | number }) => Promise<void>;
  agentState?: ConversationAgentState;
  persistAgentState?: (state: ConversationAgentState) => Promise<void>;
  deliveryZones?: Array<{ label: string; price: number }>;
  paymentMethods?: PaymentMethodConfig[];
  paymentStrategy?: PaymentStrategy;
  onSent?: (text: string, kind: 'reply' | 'card') => void;
}

export function createCompositeTools(context: CompositeToolsContext) {
  /**
   * 1. browse_catalog
   * Consolidated product search, category browsing, variant exclusion, and card presentation.
   */
  const browseCatalogTool = tool(
    async ({ query, category, startingLimit, endLimit, excludeColors, excludeSizes, sendCards = true }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'browse_catalog', result });
        return result;
      };

      const word = (query ?? '').trim();
      const from = Math.max(0, Math.trunc(startingLimit ?? 0));
      const to = Math.max(from + 1, Math.trunc(endLimit ?? from + CARD_LIST_LIMIT));
      const size = Math.min(CARD_LIST_LIMIT, to - from);

      let categoryId: string | null = null;
      let categoryHitName: string | null = null;
      const wantedCategory = (category ?? '').trim();

      if (wantedCategory) {
        const shelves = await findCategories(context.businessId);
        const folded = foldName(wantedCategory);
        const hit =
          shelves.find((c) => c.id === wantedCategory) ??
          shelves.find((c) => foldName(c.name) === folded) ??
          shelves.find((c) => foldName(c.name).includes(folded) || folded.includes(foldName(c.name)));

        if (hit) {
          categoryId = hit.id;
          categoryHitName = hit.name;
        } else {
          const withCounts = shelves.length ? await listCategories(context.businessId) : [];
          return logResult(
            JSON.stringify({
              found: false,
              reason: `Category "${wantedCategory}" not found.`,
              availableCategories: withCounts.map((c) => c.name),
            })
          );
        }
      }

      const [matches, total] = await Promise.all([
        searchProducts(context.businessId, word, size, { categoryId, offset: from }),
        countSearchResults(context.businessId, word, { categoryId }),
      ]);

      const excludedColorsNorm = (excludeColors ?? []).map((c) => c.trim().toLowerCase());
      const excludedSizesNorm = (excludeSizes ?? []).map((s) => s.trim().toLowerCase());

      const filteredItems = matches.map((p) => {
        const sellableVariants = p.variants.filter((v) => {
          if (!v.isAvailable || v.stock <= 0) return false;
          const attrs = parseVariantAttributes(v.name);
          if (attrs.color && excludedColorsNorm.includes(attrs.color.toLowerCase())) return false;
          if (attrs.size && excludedSizesNorm.includes(attrs.size.toLowerCase())) return false;
          return true;
        });

        return {
          id: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
          availableVariantCount: sellableVariants.length,
          ...(p.enrichedSpecs ? { enrichedSpecs: p.enrichedSpecs } : {}),
          variants: sellableVariants.slice(0, 6).map((v) => {
            const attrs = parseVariantAttributes(v.name);
            return {
              id: v.id,
              name: v.name,
              color: attrs.color,
              size: attrs.size,
              price: v.price ?? p.price,
              stock: v.stock,
            };
          }),
        };
      });

      let cardsAlreadySent = false;
      if (sendCards && matches.length > 0 && context.pageToken && context.customerPlatformId) {
        const cards: MessengerCard[] = [];
        for (const p of matches.slice(0, CARD_LIST_LIMIT)) {
          const sellable = p.variants.filter((v) => v.isAvailable && v.stock > 0);
          const photoVar = sellable.find((v) => v.cardImageKey || v.imageUrl) ?? p.variants.find((v) => v.cardImageKey || v.imageUrl);
          const rawKey = (p as any).cardImageKey || photoVar?.cardImageKey || photoVar?.imageUrl || null;
          const imageUrl = rawKey ? await resolveStoredImageUrl(rawKey) : null;
          if (!imageUrl) continue;
          const colors = [...new Set(sellable.map((v) => parseVariantAttributes(v.name).color).filter(Boolean))].slice(0, 3);
          const subtitle = `${money(p.price, p.currency)}${colors.length ? ` · ${colors.join(', ')}` : ''}`;
          cards.push({
            title: oneLine(p.name, 80),
            subtitle: oneLine(subtitle, 80),
            imageUrl,
            button: {
              title: 'Order',
              payload: `place order with ${p.id} and ${p.name}`,
            },
            extraButtons: [{ title: 'Details', payload: detailsProductPayload(p.id) }],
          });
        }

        if (cards.length > 0) {
          let chargedPeriod: string | null = null;
          let allowed = true;
          if (!context.sendMessageOverride) {
            try {
              const budget = await spendQuotaUnit(context.businessId, 'message');
              if (budget.spent) chargedPeriod = budget.period;
              else allowed = false;
            } catch {
              /* fail open */
            }
          }
          if (allowed) {
            const summaryText = cards.map((c) => `${c.title} — ${c.subtitle}`).join('\n');
            try {
              if (context.sendMessageOverride) {
                await context.sendMessageOverride(context.pageToken, context.customerPlatformId, summaryText);
              } else {
                await fbSendMessage(context.pageToken, context.customerPlatformId, cards, { platform: context.platform });
              }
              cardsAlreadySent = true;
              if (context.conversationId) {
                await createMessage({
                  conversationId: context.conversationId,
                  from: 'self',
                  content: summaryText,
                  state: 'done',
                }).catch(() => {});
              }
              context.onSent?.(summaryText, 'card');
            } catch (sendErr) {
              if (chargedPeriod) {
                await refundQuotaUnit(context.businessId, 'message', chargedPeriod).catch(() => {});
              }
              console.warn('[composite-tool] browse_catalog card send failed:', sendErr);
            }
          }
        }
      }

      if (context.agentState) {
        context.agentState.catalogCursor = {
          query: word || undefined,
          category: categoryHitName ?? undefined,
          nextOffset: from + filteredItems.length,
          total,
        };
      }

      return logResult(
        JSON.stringify({
          found: filteredItems.length > 0,
          totalMatching: total,
          category: categoryHitName,
          cardsAlreadySent,
          items: filteredItems,
          hasMore: from + size < total,
        })
      );
    },
    {
      name: 'browse_catalog',
      description:
        'Search and browse store products by keyword, category, or attributes with optional color/size exclusions. Automatically sends visual product cards when sendCards is true and returns matching products and variants.',
      schema: z.object({
        query: z.string().optional().describe('Product name, keyword, or SKU'),
        category: z.string().optional().describe('Category name (e.g. Saree, Electronics)'),
        startingLimit: z.number().int().min(0).optional().describe('Page offset index (defaults to 0)'),
        endLimit: z.number().int().min(1).optional().describe('Page stop index (defaults to 10)'),
        excludeColors: z.array(z.string()).optional().describe('Colors to filter out'),
        excludeSizes: z.array(z.string()).optional().describe('Sizes to filter out'),
        sendCards: z.boolean().optional().describe('Whether to send visual product cards directly to the buyer (defaults to true)'),
      }),
    }
  );

  /**
   * 2. get_product_quote
   * Resolves product and variant, checks real-time inventory, calculates delivery charge, and returns pricing.
   */
  const getProductQuoteTool = tool(
    async ({ query, photoStampCode, color, size, deliveryArea, quantity }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'get_product_quote', result });
        return result;
      };

      const qty = Math.max(1, quantity ?? 1);
      let targetProduct: any = null;
      let targetVariant: any = null;

      // 1. Photo stamp code lookup if provided
      const stamp = (photoStampCode ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (/^[A-Z0-9]{5}$/.test(stamp)) {
        targetProduct = await getProductByVariantId(context.businessId, stamp);
        if (targetProduct) {
          targetVariant = targetProduct.variants.find((v: any) => v.variantId === stamp) ?? null;
        }
      }

      // 2. Query search if not resolved by stamp code
      if (!targetProduct && query) {
        const results = await searchProducts(context.businessId, query.trim(), 3);
        if (results.length > 0) {
          targetProduct = results[0];
        }
      }

      if (!targetProduct) {
        return logResult(
          JSON.stringify({
            found: false,
            message: 'No matching product found in the catalog.',
            instruction: 'Ask the customer to clarify the product name or category.',
          })
        );
      }

      // 3. Variant matching by color and size
      if (!targetVariant && targetProduct.variants?.length > 0) {
        const wantedAttrs = [color, size].filter(Boolean).join(' ');
        if (wantedAttrs) {
          const { matches } = matchVariant(targetProduct.variants, wantedAttrs);
          if (matches.length > 0) {
            targetVariant = matches[0];
          }
        }
        // Fallback to first available in-stock variant
        if (!targetVariant) {
          targetVariant =
            targetProduct.variants.find((v: any) => v.isAvailable && v.stock > 0) ??
            targetProduct.variants[0];
        }
      }

      // 4. Calculate unit and subtotal prices
      const unitPrice = parseFloat(targetVariant?.price ?? targetProduct.price ?? '0');
      const subtotal = unitPrice * qty;
      const stockAvailable = targetVariant ? targetVariant.stock : 999;
      const inStock = targetVariant ? targetVariant.isAvailable && targetVariant.stock >= qty : true;

      // 5. Match delivery zone fee using deterministic Bangladesh geo-resolver
      let shippingCost = 0;
      let matchedZone: string | null = null;
      if (context.deliveryZones?.length) {
        if (deliveryArea) {
          const resolution = resolveDeliveryZone(deliveryArea, context.deliveryZones);
          if (resolution.status === 'resolved' && resolution.zone) {
            shippingCost = resolution.zone.price;
            matchedZone = resolution.zone.label;
          } else {
            shippingCost = context.deliveryZones[0]?.price ?? 0;
            matchedZone = context.deliveryZones[0]?.label ?? null;
          }
        } else {
          shippingCost = context.deliveryZones[0]?.price ?? 0;
          matchedZone = context.deliveryZones[0]?.label ?? null;
        }
      }

      const totalPrice = subtotal + shippingCost;
      const effectiveStrategy = resolvePaymentStrategy(context.paymentStrategy, targetProduct);

      // Extract all declared colors and sizes
      const allVariants = targetProduct.variants ?? [];
      const parsedVariants: Array<{ color: string | null; size: string | null }> = allVariants.map((v: any) => parseVariantAttributes(v.name));
      const availableColors = Array.from(new Set(parsedVariants.map((p: { color: string | null }) => p.color).filter((c): c is string => Boolean(c))));
      const availableSizes = Array.from(new Set(parsedVariants.map((p: { size: string | null }) => p.size).filter((s): s is string => Boolean(s))));

      // Update agent state
      if (context.agentState) {
        context.agentState.currentProduct = {
          id: targetProduct.id,
          name: targetProduct.name,
          price: String(targetProduct.price),
        };
        if (targetVariant) {
          context.agentState.currentVariant = {
            id: targetVariant.id,
            name: targetVariant.name,
            color: color ?? null,
            size: size ?? null,
            price: String(targetVariant.price ?? targetProduct.price),
            stock: targetVariant.stock,
          };
        }
      }

      const quote = {
        found: true,
        productId: targetProduct.id,
        productName: targetProduct.name,
        variantId: targetVariant?.id ?? null,
        variantName: targetVariant?.name ?? 'Standard',
        unitPrice: money(unitPrice, targetProduct.currency),
        quantity: qty,
        subtotal: money(subtotal, targetProduct.currency),
        deliveryArea: matchedZone ?? deliveryArea ?? 'Store default',
        shippingCost: money(shippingCost, targetProduct.currency),
        totalPrice: money(totalPrice, targetProduct.currency),
        inStock,
        stockAvailable,
        availableColors,
        availableSizes,
        paymentStrategy: PAYMENT_STRATEGY_LABELS[effectiveStrategy.effective],
        paymentStrategyDetails: PAYMENT_STRATEGY_DESCRIPTIONS[effectiveStrategy.effective],
        ...(targetProduct.enrichedSpecs ? { enrichedSpecs: targetProduct.enrichedSpecs } : {}),
      };

      return logResult(JSON.stringify(quote));
    },
    {
      name: 'get_product_quote',
      description:
        'Calculates a verified quote for a product and variant in one pass, including price, stock check, delivery fee, and payment strategy.',
      schema: z.object({
        query: z.string().describe('Product name, keyword, or SKU'),
        photoStampCode: z.string().optional().describe('5-character alphanumeric photo stamp code if visible in photo'),
        color: z.string().optional().describe('Desired color (e.g. Black, Navy)'),
        size: z.string().optional().describe('Desired size (e.g. M, XL, 42)'),
        deliveryArea: z.string().optional().describe('Customer delivery district or city (e.g. Uttara, Dhaka, Chittagong)'),
        quantity: z.number().int().min(1).optional().describe('Quantity of items (defaults to 1)'),
      }),
    }
  );

  /**
   * 3. place_order
   * Validates stock, duplicate order window, and payment rules, then commits order to PostgreSQL.
   */
  const placeOrderTool = tool(
    async ({ productId, variantId, count, customerAddress, customerPhone, shippingCost, paymentMethod, transactionId }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'place_order', result });
        return result;
      };

      const paidTransactionId = transactionId?.trim() || null;
      const orderCount = Math.max(1, count ?? 1);

      // Duplicate prevention (60 seconds for identical product+variant)
      if (context.agentState?.lastOrder?.state === 'Pending') {
        const last = context.agentState.lastOrder;
        const timeSince = Date.now() - new Date(last.createdAt).getTime();
        const sameProduct = last.productId === productId;
        const sameVariant = !variantId || !last.variantId || last.variantId === variantId;
        if (timeSince < 60 * 1000 && sameProduct && sameVariant && last.productName) {
          return logResult(
            JSON.stringify({
              created: false,
              duplicate: true,
              existingOrderId: last.id,
              message: 'This exact order was placed moments ago and is already active.',
            })
          );
        }
      }

      // Check payment requirements
      const product = await getProductById(context.businessId, productId).catch(() => null);
      if (!product) {
        return logResult(JSON.stringify({ created: false, reason: 'Product not found.' }));
      }

      const variant = product.variants?.find((v: any) => v.id === variantId) ?? product.variants?.[0] ?? null;
      if (variant && (!variant.isAvailable || variant.stock < orderCount)) {
        return logResult(
          JSON.stringify({
            created: false,
            reason: `${product.name} (${variant.name}) has only ${variant.stock} left in stock.`,
            missing: ['variantId'],
            instruction: 'Ask the customer to choose an available size/color or lower quantity.',
          })
        );
      }

      if (!customerPhone?.trim()) {
        return logResult(
          JSON.stringify({
            created: false,
            missing: ['customerPhone'],
            reason: 'Customer phone number is required.',
            instruction: 'Ask the customer for their 11-digit mobile number.',
          })
        );
      }

      if (!customerAddress?.trim()) {
        return logResult(
          JSON.stringify({
            created: false,
            missing: ['customerAddress'],
            reason: 'Delivery address is required.',
            instruction: 'Ask the customer for their full delivery address and area.',
          })
        );
      }

      // Automatically resolve delivery fee if omitted
      let resolvedShippingCost = typeof shippingCost === 'number' && shippingCost >= 0 ? shippingCost : undefined;
      if (resolvedShippingCost === undefined && customerAddress && context.deliveryZones?.length) {
        const resolution = resolveDeliveryZone(customerAddress, context.deliveryZones);
        if (resolution.status === 'resolved' && resolution.zone) {
          resolvedShippingCost = resolution.zone.price;
        } else if (resolution.status === 'unsupported_international') {
          return logResult(
            JSON.stringify({
              created: false,
              missing: ['deliveryArea'],
              reason: 'International delivery is not supported.',
              instruction: 'Politely explain delivery is available inside Bangladesh only, or escalate if requested.',
            })
          );
        }
      }

      // Validate payment strategy & transactionId requirements before DB insert
      const unitPrice = parseFloat(String(variant?.price ?? product.price));
      const subtotal = Number.isFinite(unitPrice) ? unitPrice * orderCount : 0;
      const effectiveStrategy = resolvePaymentStrategy(
        context.paymentStrategy ?? 'cod',
        product.paymentStrategyOverride as PaymentStrategy | null | undefined,
      );
      const paymentCheck = checkOrderPayment({
        paymentMethod,
        transactionId: paidTransactionId,
        paymentMethods: context.paymentMethods ?? [],
        strategy: effectiveStrategy.effective,
        shippingCost: resolvedShippingCost ?? 0,
      });

      if (!paymentCheck.ok) {
        const configuredAccounts = (context.paymentMethods ?? [])
          .map((m) => `${m.name}${m.info ? `: ${m.info}` : ''}`)
          .join('; ');
        const dueNow = upfrontAmount(effectiveStrategy.effective, {
          itemsTotal: subtotal,
          shippingCost: resolvedShippingCost ?? 0,
        });
        return logResult(
          JSON.stringify({
            created: false,
            missing: paymentCheck.missing,
            reason: paymentCheck.message,
            paymentInfo: paymentCheck.paymentInfo ?? (configuredAccounts || 'Configured non-COD payment methods'),
            upfrontRequired: dueNow > 0 ? money(dueNow, product.currency) : undefined,
            instruction: `Explain the required payment (${paymentCheck.message}) with account details (${configuredAccounts}) and ask for the TrxID before retrying place_order.`,
          })
        );
      }

      // Create order in database
      try {
        const createdOrder = await createOrder({
          businessId: context.businessId,
          productId: product.id,
          variantId: variant?.id || undefined,
          count: orderCount,
          customerName: context.customerName ?? 'Customer',
          customerAddress: customerAddress || undefined,
          customerPhone: customerPhone || undefined,
          customerPlatformId: context.customerPlatformId || undefined,
          conversationId: context.conversationId || undefined,
          shippingCost: resolvedShippingCost,
          paymentMethod: paymentMethod?.trim() ? paymentMethod.trim() : undefined,
          transactionId: paidTransactionId || undefined,
        });

        // Update state
        if (context.agentState) {
          context.agentState.lastOrder = {
            id: createdOrder.id,
            productId: product.id,
            productName: product.name,
            variantId: variant?.id ?? null,
            variantName: variant?.name ?? null,
            count: orderCount,
            totalPrice: String(createdOrder.totalPrice),
            state: 'Pending',
            createdAt: new Date().toISOString(),
          };
        }

        try {
          await context.onOrderCreated?.({ id: createdOrder.id, totalPrice: createdOrder.totalPrice });
        } catch (sendErr) {
          console.warn('[composite-tool] receipt send failed (non-fatal, e.g. test token):', sendErr);
        }

        return logResult(
          JSON.stringify({
            created: true,
            orderId: createdOrder.id,
            productName: product.name,
            variantName: variant?.name ?? null,
            count: orderCount,
            totalPrice: money(createdOrder.totalPrice, product.currency),
            state: 'Pending',
          })
        );
      } catch (err) {
        console.error('[composite-tool] place_order failed:', err);
        const reason = err instanceof Error ? err.message : 'Failed to create order in database.';
        return logResult(JSON.stringify({ created: false, reason }));
      }
    },
    {
      name: 'place_order',
      description:
        'Places a confirmed customer order with delivery details, phone, and payment info. Requires customer confirmation.',
      schema: z.object({
        productId: z.string().uuid().describe('Product UUID to order'),
        variantId: z.string().uuid().optional().describe('Specific variant UUID'),
        count: z.number().int().min(1).optional().describe('Quantity of items (defaults to 1)'),
        customerAddress: z.string().describe('Full delivery address with city/district'),
        customerPhone: z.string().describe('Customer contact phone number'),
        shippingCost: z.number().min(0).optional().describe('Delivery fee in BDT matching the area'),
        paymentMethod: z.string().optional().describe('Payment method (e.g. Cash on delivery, bKash)'),
        transactionId: z.string().optional().describe('Payment transaction ID if prepaid method selected'),
      }),
    }
  );

  /**
   * 4. get_order_status
   * Retrieves order status, parcel tracking info, and order history.
   */
  const getOrderStatusTool = tool(
    async ({ orderId }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'get_order_status', result });
        return result;
      };

      const targetId = orderId || context.agentState?.lastOrder?.id;

      if (targetId) {
        const order = await getOrderById(context.businessId, targetId);
        if (order) {
          return logResult(
            JSON.stringify({
              found: true,
              orderId: order.id,
              productName: order.productName,
              variantName: order.variantName,
              count: order.count,
              totalPrice: money(order.totalPrice, order.currency),
              state: stateWord(order.state),
              createdAt: order.createdAt?.toISOString().slice(0, 10),
              trackingAvailable: order.state === 'onDelivery' || order.state === 'done',
            })
          );
        }
      }

      // Fetch customer's past orders if no specific order ID or if ID not found
      if (context.customerPlatformId) {
        const { orders: pastOrders } = await getOrdersByPlatformId(
          context.businessId,
          context.customerPlatformId,
          { limit: 5 }
        );
        if (pastOrders.length > 0) {
          return logResult(
            JSON.stringify({
              found: true,
              recentOrders: pastOrders.map((o) => ({
                orderId: o.id,
                item: `${o.count} × ${o.productName ?? 'Order'}`,
                total: money(o.totalPrice, o.currency),
                state: stateWord(o.state),
                date: o.createdAt?.toISOString().slice(0, 10),
              })),
            })
          );
        }
      }

      return logResult(
        JSON.stringify({
          found: false,
          message: 'No orders found for this customer.',
        })
      );
    },
    {
      name: 'get_order_status',
      description:
        'Retrieves current order status, delivery progress, and tracking details by order ID or customer history.',
      schema: z.object({
        orderId: z.string().uuid().optional().describe('Order UUID (leave empty to use last active order)'),
      }),
    }
  );

  return {
    browseCatalogTool,
    getProductQuoteTool,
    placeOrderTool,
    getOrderStatusTool,
  };
}
