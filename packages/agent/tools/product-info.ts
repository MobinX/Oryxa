import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { getProductById } from '@repo/db/crud/product';
import { getProductInfoPrompt } from '@repo/db/crud/subagent';
import { PRODUCT_INFO_SYSTEM_PROMPT } from '@repo/shared';
import {
  createStoreAgentModel,
  defaultAgentProvider,
  agentModelName,
  type AgentProvider,
} from '@agent/model';
import { agentLog } from '@agent/log';
import type { AgentTokenUsage } from '@agent/usage';
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
 * The reviewed brief, re-exported from `@repo/shared` for callers that still name it here. What a run
 * actually uses is the `subagents` row, read on every call — `/admin/subagent` edits that.
 */
export { PRODUCT_INFO_SYSTEM_PROMPT };

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
  /** Folds the helper's tokens into the run the customer is being billed for. */
  onTokenUsage?: (usage: AgentTokenUsage) => void;
  /** Injected in tests so the helper never reaches the network. */
  llm?: BaseChatModel;
}

/** The facts a helper turn is allowed to know, and the question it is answering. */
export interface ProductAnswerRequest {
  product: ProductRow;
  businessName?: string | null;
  userQuery: string;
  /** The operator-edited brief the run uses. The tool reads it from `subagents` on every call. */
  systemPrompt: string;
  llm?: BaseChatModel;
}

export interface ProductAnswer {
  text: string;
  usage: AgentTokenUsage;
  provider: AgentProvider;
  model: string;
  latencyMs: number;
}

/**
 * Run the tool-less answer writer over one product row.
 *
 * Shared by the agent tool and `/admin/subagent`'s playground: a preview that took a different path
 * than production would be a nice demo and a poor test. Nothing here reads the database for the
 * prompt — the caller decides which text runs, so a draft can be tried before it is saved.
 */
export async function writeProductAnswer(request: ProductAnswerRequest): Promise<ProductAnswer> {
  const started = performance.now();
  const provider = defaultAgentProvider();
  const model = agentModelName(provider);
  const data = buildProductInfoData(request.product);

  const llm = request.llm ?? createStoreAgentModel({
    provider,
    reasoningEffort: 'low',
    promptCacheKey: 'oryxa:product-info:v1',
  });
  const helper = createReactAgent({ llm, tools: [] });

  const answer = await helper.invoke(
    {
      messages: [
        new SystemMessage(request.systemPrompt),
        new HumanMessage([
          `STORE NAME: ${request.businessName?.trim() || 'the store'}`,
          `PRODUCT DATA:\n${JSON.stringify(data)}`,
          `CUSTOMER QUESTION: ${request.userQuery.trim()}`,
        ].join('\n\n')),
      ],
    },
    { recursionLimit: 6 },
  );

  const usage = usageOf(answer.messages);
  const ranked = [...answer.messages].reverse().find((message) => message._getType() === 'ai');

  return {
    text: cleanProductAnswer(textOf(ranked?.content)),
    usage,
    provider,
    model,
    latencyMs: Math.round(performance.now() - started),
  };
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

        // Read on every call, not once per process: the console's edit has to reach the next
        // customer turn, and a cached prompt would quietly keep answering with the old rules.
        const systemPrompt = await getProductInfoPrompt();
        const answer = await writeProductAnswer({
          product,
          businessName: context.businessName,
          userQuery,
          systemPrompt,
          llm: context.llm,
        });
        const { usage, text: generated } = answer;
        const variantCount = product.variants.length;

        // The helper is part of this turn: its tokens join the run's totals so the usage row the
        // runner writes is the provider's bill, not the sales model's share of it.
        context.onTokenUsage?.(usage);

        agentLog('product_info', {
          productId,
          ok: generated.length > 0,
          found: true,
          variantCount,
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
