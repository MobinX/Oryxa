import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredTool } from '@langchain/core/tools';
import { getB2ObjectBytes } from '@repo/integrations/b2';
import { createAgentTools } from '@agent/tools';
import { COMMENT_REPLY_GUIDANCE, DEFAULT_REPLY_GUIDANCE } from '@agent/guidance';
import type { ConversationAgentState } from '@repo/shared';
import {
  formatCompactAgentState,
  detectTurnLanguage,
  classifyTurnIntent,
  validateAndSanitizeReply,
} from '@repo/shared';

/** Callback type for emitting structured debug/observability events. */
export type SseEmitter = (event: string, data: unknown) => void;

/**
 * The text a model actually answered with.
 *
 * The chat-completions path hands back a string; the Responses path hands back a list of content blocks
 * with the prose in one `{type:'text'}` part among them. `String(blocks)` is "[object Object]" and
 * `JSON.stringify(blocks)` is a bracketed blob, so every place that shows a customer or stores a model's
 * answer reads it through here rather than learning that the hard way.
 */
export function contentText(content: unknown): string {
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
  return content == null ? '' : JSON.stringify(content);
}

/**
 * What a picture the model is not shown becomes in its history: the fact, without the pixels.
 * Phrased as a note about the message rather than an instruction, because it sits in the
 * customer's turn and the model has to be able to tell whose words those are.
 */
const PHOTO_UNAVAILABLE_NOTE = '[a picture was attached to this message; it could not be loaded]';

/**
 * The same fact for a picture the runner left out of the pixels on purpose: outside the small
 * window of recent ones, so the model still knows it existed and does not treat the turn as a
 * photo it has never been given.
 */
const PHOTO_OUTDATED_NOTE = '[a picture was attached to this message; it is older than the pictures shown here and is not repeated]';

/** The same fact for a run whose model has no eyes at all — nothing about the storage failed. */
const PHOTO_UNSEEN_NOTE = '[a picture was attached to this message; this model cannot read pictures]';

/** Number of recent chronological messages where customer photos remain active in context for follow-up questions. */
export const PHOTO_TURN_RETENTION_WINDOW = 5;

/**
 * One picture as the model's provider asks for it.
 *
 * Chat Completions names a picture `image_url` and answers anything else with
 * `400 Invalid value: 'image'`; the Gemini adapter wants the standard `image` block. LangChain's
 * shared block type admits both spellings and converts neither, so the choice is ours to make —
 * and getting it wrong is silent until the request leaves the process.
 */
export function photoBlock(contentType: string, base64: string, asUrlPart: boolean): ContentBlock {
  return asUrlPart
    ? { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}` } }
    : { type: 'image', data: base64, mimeType: contentType };
}

export interface AgentConfig {
  systemPrompt: string;
  business: {
    id: string;
    name: string;
    description?: string | null;
    agentProductGuidance?: string | null;
    agentBargainGuidance?: string | null;
  };
  /**
   * The thread the model is about to read. `imageKeys` are the bucket keys of the pictures the
   * runner decided this run should show as pixels — the ones being answered now plus the most
   * recent few before them; `hadImages` says an older turn carried one, which the model is told
   * about in words instead of pixels.
   */
  history: Array<{
    from: string;
    content: string;
    imageKeys?: string[];
    hadImages?: boolean;
  }>;
  conversationId: string;
  pageToken: string;
  customerPlatformId: string;
  customerName?: string | null;
  /** Which inbox this token answers as; tools use it for the platform's text limit and wording. */
  platform?: 'facebook' | 'instagram';
  /** True on the turn right after a customer typed instead of tapping the offered chips. */
  suppressSuggestions?: boolean;
  catalogSummary?: string;
  /** Per-thread facts, kept after the stable prompt prefix for cache reuse. */
  agentState?: ConversationAgentState;
  persistAgentState?: (state: ConversationAgentState) => Promise<void>;
  onOrderCreated?: (orderId: string) => Promise<void>;
  /** Facebook post text, supplied only for comment replies. */
  postContext?: string | null;
  /** Inject a fake or test chat model (defaults to Gemini in production). */
  llm?: BaseChatModel;
  /** Select the LLM provider to use (defaults to 'openai' if OPENAI_API_KEY is set, otherwise 'gemini'). */
  llmProvider?: 'gemini' | 'openai';
  /** Override the default Messenger tool set (e.g. the comment tool set). */
  tools?: StructuredTool[];
  /** Override the default Messenger reply guidance in the system prompt. */
  replyGuidance?: string;
  promptCacheKey?: string;
  /** Reasoning effort for OpenAI reasoning deployments (defaults to 'low' for text, 'medium' for photos). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * If provided, the agent emits structured debug events for every tool
   * call, tool result, and final reply. Production runs leave this undefined.
   */
  emitSse?: SseEmitter;
  /**
   * Override the Facebook sendMessage function. When set, no real HTTP call
   * is made to the Meta Send API — useful for the test webhook and unit tests.
   * Only honoured when the default Messenger tool set is used (i.e. `tools`
   * is not overridden).
   */
  sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>;
}

export interface TokenUsageMetrics {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitPercent: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface AgentRunResult {
  replyText: string;
  sentTexts: string[];
  metrics: TokenUsageMetrics;
  /**
   * The whole turn as the model saw it — system, history, every tool call and result, every
   * reply — flattened for the wire. Production callers can ignore it; the playground streams it
   * to the operator's screen, where the per-message usage numbers are the point.
   */
  messages: TraceMessage[];
}

/** What one model call charged, as the provider reported it. */
export interface TraceUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Tokens answered from the prompt cache, when the provider says so. */
  cacheReadTokens: number;
  /** Tokens the provider spent thinking, when it reports that at all. */
  reasoningTokens: number;
}

/** One tool the model decided to call, with the arguments it chose. */
export interface TraceToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** One message of the turn, flattened to what a screen needs. */
export interface TraceMessage {
  role: 'system' | 'user' | 'ai' | 'tool';
  content: string;
  /** On an `ai` message: the tools it asked for. The results follow as `tool` messages. */
  toolCalls?: TraceToolCall[];
  /** On a `tool` message: which call this answers, and which tool wrote it. */
  toolCallId?: string;
  toolName?: string;
  /** Present on the `ai` messages the provider metered; that is one per model call, not one per turn. */
  usage?: TraceUsage | null;
}

/** Content for the wire: prose kept, a picture said in one word, nothing else survives. */
function traceContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        const block = part as Record<string, unknown>;
        if (block.type === 'text' && typeof block.text === 'string') return block.text;
        if (block.type === 'image_url' || block.type === 'image' || block.type === 'media') return '[photo]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : String(content);
}

function traceUsage(msg: BaseMessage): TraceUsage | null {
  const usage = (msg as AIMessage).usage_metadata;
  if (!usage) return null;
  const details = (usage as { input_token_details?: Record<string, number> }).input_token_details;
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cacheReadTokens: details?.cache_read || details?.cached_tokens || 0,
    reasoningTokens: details?.reasoning || 0,
  };
}

/**
 * Flattens the LangGraph result into plain objects that survive `JSON.stringify` to a browser.
 *
 * A `BaseMessage` is a class with getters, content blocks and tool-call objects; shipped raw it
 * arrives as an empty-looking shell. This is the one place that knows which parts of each message
 * a person wants to read, so the SSE layer stays dumb.
 */
export function serializeTraceMessages(messages: BaseMessage[]): TraceMessage[] {
  return messages.map((msg) => {
    const kind = msg._getType();

    if (kind === 'ai') {
      const ai = msg as AIMessage;
      const calls = (ai.tool_calls ?? []).map((call) => ({
        id: String(call.id ?? ''),
        name: call.name,
        args: call.args,
      }));
      return {
        role: 'ai' as const,
        content: traceContent(msg.content),
        ...(calls.length > 0 ? { toolCalls: calls } : {}),
        usage: traceUsage(msg),
      };
    }

    if (kind === 'tool') {
      const tool = msg as AIMessage & { tool_call_id?: string; name?: string };
      return {
        role: 'tool' as const,
        content: traceContent(msg.content),
        toolCallId: tool.tool_call_id,
        toolName: tool.name,
      };
    }

    return {
      role: kind === 'human' ? ('user' as const) : ('system' as const),
      content: traceContent(msg.content),
    };
  });
}

export class Agent {
  /** Every text that reached Messenger during `run()` — a reply, a card row, a button row. */
  sentTexts: string[] = [];

  constructor(private config: AgentConfig) {}

  async run(): Promise<AgentRunResult> {
    const startTime = Date.now();
    const provider =
      this.config.llmProvider ??
      (process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini');

    const modelName =
      provider === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-6-luna')
        : 'gemini-flash-lite-latest';
    const replyGuidance = this.config.replyGuidance ?? DEFAULT_REPLY_GUIDANCE;
    const promptCacheKey = this.config.promptCacheKey ?? (replyGuidance === COMMENT_REPLY_GUIDANCE
      ? 'oryxa:comment:v1'
      : 'oryxa:messenger:v1');

    // `photos` is not a field a history row carries — `imageKeys` is what arrived, `hadImages` is
    // what an older turn was summarised from. Customer photos are retained in context over a 5-turn window.
    const hasPhotosInTurn = this.config.history
      .slice(-PHOTO_TURN_RETENTION_WINDOW)
      .some((m) => (m.imageKeys?.length ?? 0) > 0 || Boolean(m.hadImages));
    const reasoningEffort = this.config.reasoningEffort
      ?? (process.env.OPENAI_REASONING_EFFORT as 'low' | 'medium' | 'high' | undefined)
      ?? (hasPhotosInTurn ? 'medium' : 'low');

    const llm =
      this.config.llm ??
      (provider === 'openai'
        ? new ChatOpenAI({
            model: modelName,
            apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
            configuration: {
              baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
            },
            // The Responses API is the path that forwards `reasoning` to a reasoning deployment. On chat
            // completions LangChain names the reply cap from its own model test — o\d and gpt-5* — so a
            // deployment called gpt-6-luna gets `max_tokens`, which Azure rejects with a 400. No cap and
            // no temperature are set, which is what this model expects.
            reasoning: { effort: reasoningEffort },
            promptCacheKey,
            useResponsesApi: true,
          })
        : new ChatGoogleGenerativeAI({
            model: modelName,
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0.3,
          }));

    // `gemini-flash-lite-latest` — the only model this path uses on Gemini — has no eyes: its
    // adapter throws on an image part instead of ignoring it. A picture goes to a model that can
    // look at one, and to every other model as a note saying a picture was sent.
    const canReadPhotos =
      provider === 'openai' || /vision|gemini-(1\.5|2|3)/.test(modelName);

    const sentTexts = this.sentTexts;
    const { emitSse, sendMessageOverride } = this.config;

    const tools: StructuredTool[] =
      this.config.tools ??
      createAgentTools(
        {
          businessId: this.config.business.id,
          conversationId: this.config.conversationId,
          pageToken: this.config.pageToken,
          customerPlatformId: this.config.customerPlatformId,
          customerName: this.config.customerName,
          platform: this.config.platform,
          suppressSuggestions: this.config.suppressSuggestions,
          emitSse,
          sendMessageOverride,
          onOrderCreated: this.config.onOrderCreated,
          agentState: this.config.agentState,
          persistAgentState: this.config.persistAgentState,
        },
        (text) => sentTexts.push(text),
      );

    const agent = createReactAgent({ llm, tools });

    const systemContent = [this.config.systemPrompt, replyGuidance]
      .filter(Boolean)
      .join('\n');

    const latestCustomerMsg = [...this.config.history].reverse().find((m) => m.from === 'customer')?.content ?? '';
    const turnLanguage = detectTurnLanguage(latestCustomerMsg, this.config.agentState);
    const turnIntent = classifyTurnIntent(latestCustomerMsg, this.config.agentState, this.config.postContext);

    // Save detected language to agentState
    if (this.config.agentState) {
      this.config.agentState.lastReplyLanguage = turnLanguage;
    }

    const compactState = this.config.agentState ? formatCompactAgentState(this.config.agentState) : null;
    const dynamicContent = [
      `You are a sales rep for ${this.config.business.name}.`,
      this.config.business.description ? `Business: ${this.config.business.description}` : '',
      this.config.business.agentProductGuidance
        ? `How to answer questions about products: ${this.config.business.agentProductGuidance}`
        : '',
      this.config.business.agentBargainGuidance
        ? `When a customer wants to bargain: ${this.config.business.agentBargainGuidance}`
        : '',
      this.config.postContext ? `Post being commented on:\n${this.config.postContext}` : '',
      this.config.catalogSummary ? `Catalog preview:\n${this.config.catalogSummary}` : '',
      compactState ? `Conversation state (verified facts):\n${JSON.stringify(compactState)}` : '',
      `Reply language: ${turnLanguage === 'bn' ? 'Bangla (শুদ্ধ বাংলা)' : 'English'} (strict matching required).`,
      turnIntent ? `Turn intent: ${turnIntent}.` : '',
    ].filter(Boolean).join('\n');

    console.log(`[agent] starting run — conversationId=${this.config.conversationId} historyLen=${this.config.history.length} lang=${turnLanguage} intent=${turnIntent}`);
    emitSse?.('agent_start', {
      conversationId: this.config.conversationId,
      business: this.config.business.name,
      historyLen: this.config.history.length,
      turnLanguage,
      turnIntent,
    });

    const messages: BaseMessage[] = [
      new SystemMessage(systemContent),
      ...(dynamicContent ? [new SystemMessage(dynamicContent)] : []),
      ...(await this.historyMessages(canReadPhotos, provider === 'openai')),
    ];

    // LangGraph counts every node the loop executes — one model call, one tool run, alternating. Six
    // bought two tool calls and nothing else: a third call, however legitimate (a search that came
    // back empty, a retry, a card that could not be sent), left the graph one step over the limit
    // with the customer's reply unwritten, and the run died in GraphRecursionError. Twenty-five is
    // LangGraph's own default — eleven tool calls' worth — and costs nothing unless the model
    // actually makes them; a genuine loop still trips it instead of running away.
    const result = await agent.invoke({ messages }, { recursionLimit: 25 });
    const latencyMs = Date.now() - startTime;
    const lastMessage = result.messages[result.messages.length - 1];
    let replyText = contentText(lastMessage.content);

    // Post-generation validation & sanitization
    const validation = validateAndSanitizeReply(replyText, {
      expectedLanguage: turnLanguage,
      channel: this.config.tools ? 'comment' : 'messenger',
      isSilentExpected: turnIntent === 'comment_silent',
    });
    replyText = validation.sanitizedText;
    if (!validation.isValid) {
      console.log(`[agent] reply sanitized violations: ${validation.violations.join(', ')}`);
    }

    // Aggregate usage metadata across all AI messages in the React loop
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHitTokens = 0;

    for (const msg of result.messages) {
      if (msg._getType() !== 'ai') continue;
      // usage_metadata only exists on AIMessage; _getType() isn't a type predicate.
      const usage = (msg as AIMessage).usage_metadata;
      if (!usage) continue;
      inputTokens += usage.input_tokens || 0;
      outputTokens += usage.output_tokens || 0;

      const details = (usage as any).input_token_details;
      if (details) {
        cacheHitTokens += details.cache_read || details.cached_tokens || 0;
      }
    }

    const totalTokens = inputTokens + outputTokens;
    const cacheMissTokens = Math.max(0, inputTokens - cacheHitTokens);
    const cacheHitPercent = inputTokens > 0 ? parseFloat(((cacheHitTokens / inputTokens) * 100).toFixed(2)) : 0;
    
    // Estimate cost (Gemini: $0.075/1M in, $0.30/1M out). The OpenAI rates are the ones gpt-5-mini was
    // priced at and have NOT been re-checked for gpt-6-luna, so estimated_cost_usd is a scale, not a bill.
    const rateIn = provider === 'openai' ? 0.15 : 0.075;
    const rateOut = provider === 'openai' ? 0.60 : 0.30;
    const estimatedCostUsd = parseFloat(((inputTokens / 1e6) * rateIn + (outputTokens / 1e6) * rateOut).toFixed(6));

    const metrics: TokenUsageMetrics = {
      provider,
      model: modelName,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheHitTokens,
      cacheMissTokens,
      cacheHitPercent,
      latencyMs,
      estimatedCostUsd,
    };

    console.log(`[agent] run complete — sentTexts=${sentTexts.length} totalTokens=${totalTokens} cacheHit%=${cacheHitPercent}% finalReply="${replyText.slice(0, 120)}${replyText.length > 120 ? '…' : ''}"`);
    emitSse?.('reply', { text: replyText });

    return {
      replyText,
      sentTexts: this.sentTexts,
      metrics,
      messages: serializeTraceMessages(result.messages),
    };
  }

  /**
   * The history rows as model messages.
   *
   * The runner has already marked each turn: pixels for the pictures worth paying for twice, a
   * sentence for the ones older than that. Re-reading a whole thread's photos on each reply charges
   * the merchant for images nobody is asking about any more, and still leaves the model knowing one
   * existed — which is what a customer's "so is it the blue one?" needs to be answered at all.
   */
  private async historyMessages(canReadPhotos: boolean, photosAsUrlPart: boolean): Promise<BaseMessage[]> {
    const turns: BaseMessage[] = [];

    for (const m of this.config.history) {
      const wanted = (m.imageKeys?.length ?? 0) > 0 || Boolean(m.hadImages);
      const photos: ContentBlock[] = [];

      if (canReadPhotos && !m.hadImages) {
        for (const key of m.imageKeys ?? []) {
          try {
            const object = await getB2ObjectBytes(key);
            photos.push(photoBlock(object.contentType, object.buffer.toString('base64'), photosAsUrlPart));
          } catch {
            // A picture the bucket will not hand back is a turn answered without it — the caption
            // the customer typed beside the photo is still worth a reply.
          }
        }
      }

      const note = wanted && photos.length === 0
        ? !canReadPhotos
          ? PHOTO_UNSEEN_NOTE
          : m.hadImages
            ? PHOTO_OUTDATED_NOTE
            : PHOTO_UNAVAILABLE_NOTE
        : '';
      const text = [m.content, note].filter(Boolean).join('\n\n');

      const blocks: ContentBlock[] = [];
      if (text) blocks.push({ type: 'text', text });
      blocks.push(...photos);

      // A plain string stays a plain string: only a turn that actually carries a picture becomes
      // a content array, so every text-only thread reaches the model exactly as it always did.
      const content =
        blocks.length === 0
          ? ''
          : blocks.length === 1 && blocks[0].type === 'text'
            ? text
            : blocks;

      turns.push(m.from === 'customer' ? new HumanMessage(content) : new AIMessage(content));
    }

    return turns;
  }
}

