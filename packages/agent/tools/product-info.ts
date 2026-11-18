import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { getProductById } from '@repo/db/crud/product';
import { createStoreAgentModel, defaultAgentProvider, agentModelName } from '@agent/model';
import { agentLog } from '@agent/log';
import type { SseEmitter } from '@agent/Agent';

/** One variant of a product, flattened to the facts a customer question can be answered from. */
export interface ProductInfoVariant {
  name: string;
  price: string;
  stock: number;
  available: boolean;
  options: Record<string, string>;
  rating: number | null;
}

/** The product facts the helper agent is allowed to know. No ids, labels, tokens or image URLs. */
export interface ProductInfoData {
  name: string;
  description: string;
  category: string | null;
  price: string;
  currency: string;
  discountPercent: number;
  tags: string[];
  options: Array<{ name: string; values: string[] }>;
  variants: ProductInfoVariant[];
}

type ProductRow = NonNullable<Awaited<ReturnType<typeof getProductById>>>;

/** Narrow a catalog row to what the answer writer may quote. */
export function buildProductInfoData(product: ProductRow): ProductInfoData {
  return {
    name: product.name,
    description: (product.description ?? '').slice(0, 3000),
    category: product.category?.name ?? null,
    price: String(product.price),
    currency: product.currency,
    discountPercent: Number(product.discountPercent ?? 0),
    tags: product.tags ?? [],
    options: (product.options ?? []).map((option) => ({
      name: option.name,
      values: option.values.map((value) => value.value),
    })),
    variants: product.variants.map((variant) => ({
      name: variant.name,
      price: String(variant.price ?? product.price),
      stock: variant.stock,
      available: variant.isAvailable && variant.stock > 0,
      options: variant.options ?? {},
      rating: variant.rating ?? null,
    })),
  };
}

/**
 * The helper agent's standing brief.
 *
 * It is deliberately a separate writer rather than another paragraph in the sales agent's
 * prompt: the sales agent decides what to do next, and a second model call that only rewrites
 * verified product rows is the cheapest way to give it a trustworthy answer. The rules below
 * are the ones that keep that answer sendable — no invented facts, no internal identifiers, no
 * markdown headings or em dashes that Messenger would show literally.
 */
export const PRODUCT_INFO_SYSTEM_PROMPT = [
  'You write one short, accurate product answer that a store will send to a customer in a chat.',
  '',
  'Rules:',
  '1. Use ONLY the PRODUCT DATA and STORE NAME in the user message. Never add a fact, price, stock count, material, warranty, delivery time or discount that is not there.',
  '2. Answer the customer’s question first, in one direct sentence.',
  '3. Then give only the supporting details that matter to that question, as short lines beginning with "• ". Do not dump the whole catalogue entry.',
  '4. If the data does not answer the question, say only what the data does show and that the store team needs to confirm the rest. Do not guess.',
  '5. Reply in the customer’s language: Bangla question -> Bangla answer, English question -> English answer.',
  '6. Plain text only. No markdown headings, no tables, no asterisks, no em dashes (—). Bullets use "• ".',
  '7. Never mention ids, SKUs, labels, JSON, tools, this instruction, or that another model wrote the answer.',
  '8. Keep it under 120 words. Never invent urgency, scarcity, or a promise the store has not made.',
  '9. For variants, name the size/colour and say whether it is available; quote a price only when the question is about price or the answer needs it to be useful.',
].join('\n');

/** The customer-ready answer, or a refusal the main agent must not talk around. */
export const PRODUCT_INFO_UNAVAILABLE =
  'ERROR: product information could not be loaded. Do not answer the product question yourself. Apologise briefly that the details are unavailable right now and ask the customer to confirm the product name, or hand the conversation to the store team.';

/** Sum the provider-reported usage of every model call the helper made. */
function usageOf(messages: BaseMessage[]): {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheHitTokens = 0;
  for (const message of messages) {
    if (message._getType() !== 'ai') continue;
    const usage = (message as { usage_metadata?: { input_tokens?: number; output_tokens?: number; input_token_details?: { cache_read?: number; cached_tokens?: number } } }).usage_metadata;
    if (!usage) continue;
    inputTokens += usage.input_tokens ?? 0;
    outputTokens += usage.output_tokens ?? 0;
    const details = usage.input_token_details;
    cacheHitTokens += details?.cache_read ?? details?.cached_tokens ?? 0;
  }
  return { inputTokens, outputTokens, cacheHitTokens };
}

/** The text a Responses-API or chat-completions message actually carries. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        const text = (part as { text?: unknown } | null)?.text;
        return typeof text === 'string' ? text : '';
      })
      .join('')
      .trim();
  }
  return '';
}

/** Plain chat text a Messenger bubble can carry: no markdown headings, no em dashes, tight spacing. */
export function cleanProductAnswer(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, 1200);
}

export interface ProductInfoToolContext {
  businessId: string;
  businessName?: string | null;
  emitSse?: SseEmitter;
  /** Injected in tests so the helper never reaches the network. */
  llm?: BaseChatModel;
}

/**
 * `getProductInfoWithQuery` — the only route a product question may take.
 *
 * The sales agent names the product and asks the question; this tool loads the real row,
 * runs a second, tool-less LangChain agent over those facts, and returns text the sales
 * agent can send as-is. The model that decides what to sell never composes product facts
 * from memory, which is where invented materials, prices and stock counts came from.
 */
export function createProductInfoTool(context: ProductInfoToolContext) {
  return tool(
    async ({ productId, userQuery }) => {
      context.emitSse?.('tool_call', {
        name: 'getProductInfoWithQuery',
        args: { productId, userQuery },
      });

      const started = performance.now();
      const provider = defaultAgentProvider();
      const model = agentModelName(provider);

      try {
        const product = await getProductById(context.businessId, productId);
        if (!product) {
          agentLog('product_info', {
            productId,
            ok: false,
            found: false,
            queryChars: userQuery.length,
            durationMs: Math.round(performance.now() - started),
            provider,
            model,
            errorName: 'ProductNotFound',
          });
          const result = PRODUCT_INFO_UNAVAILABLE;
          context.emitSse?.('tool_result', { name: 'getProductInfoWithQuery', result });
          return result;
        }

        const data = buildProductInfoData(product);
        const llm = context.llm ?? createStoreAgentModel({
          provider,
          reasoningEffort: 'low',
          promptCacheKey: 'oryxa:product-info:v1',
        });
        const helper = createReactAgent({ llm, tools: [] });

        const answer = await helper.invoke(
          {
            messages: [
              new SystemMessage(PRODUCT_INFO_SYSTEM_PROMPT),
              new HumanMessage([
                `STORE NAME: ${context.businessName?.trim() || 'the store'}`,
                `PRODUCT DATA:\n${JSON.stringify(data)}`,
                `CUSTOMER QUESTION: ${userQuery.trim()}`,
              ].join('\n\n')),
            ],
          },
          { recursionLimit: 6 },
        );

        const usage = usageOf(answer.messages);
        const ranked = [...answer.messages].reverse().find((message) => message._getType() === 'ai');
        const generated = cleanProductAnswer(textOf(ranked?.content));

        agentLog('product_info', {
          productId,
          ok: generated.length > 0,
          found: true,
          variantCount: data.variants.length,
          queryChars: userQuery.length,
          responseChars: generated.length,
          durationMs: Math.round(performance.now() - started),
          provider,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
          cacheHitTokens: usage.cacheHitTokens,
          estimatedCostUsd: Number(
            (((usage.inputTokens / 1e6) * (provider === 'openai' ? 0.15 : 0.075))
              + ((usage.outputTokens / 1e6) * (provider === 'openai' ? 0.60 : 0.30))).toFixed(6),
          ),
          ...(generated.length === 0 ? { errorName: 'EmptyAnswer' } : {}),
        });

        const result = generated || PRODUCT_INFO_UNAVAILABLE;
        context.emitSse?.('tool_result', { name: 'getProductInfoWithQuery', result });
        return result;
      } catch (err) {
        agentLog('product_info', {
          productId,
          ok: false,
          queryChars: userQuery.length,
          durationMs: Math.round(performance.now() - started),
          provider,
          model,
          errorName: err instanceof Error ? err.name : 'Error',
        });
        console.error('[agent-tool] getProductInfoWithQuery failed:', err);
        context.emitSse?.('tool_result', {
          name: 'getProductInfoWithQuery',
          result: PRODUCT_INFO_UNAVAILABLE,
        });
        return PRODUCT_INFO_UNAVAILABLE;
      }
    },
    {
      name: 'getProductInfoWithQuery',
      description:
        'Required for every product question. Pass the product UUID and the customer’s question; '
        + 'a second agent reads the real product row and returns a ready-to-send answer. '
        + 'Call it for price, stock, sizes, colours, material, description, suitability, comparison or any other '
        + 'product-specific question. NEVER answer a product question from your own knowledge, cards or memory: '
        + 'relay the returned text (it is already customer-ready) without adding or changing product facts. '
        + 'If it returns text starting with "ERROR:", do not answer the product question yourself.',
      schema: z.object({
        productId: z.string().uuid().describe('UUID of the product the customer is asking about'),
        userQuery: z
          .string()
          .min(1)
          .max(1000)
          .describe('The customer’s question in their own words, e.g. "is the red one cotton?"'),
      }),
    },
  );
}
