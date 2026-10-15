import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredTool } from '@langchain/core/tools';
import { getB2ObjectBytes } from '@repo/integrations/b2';
import { createAgentTools } from '@agent/tools';
import { DEFAULT_REPLY_GUIDANCE } from '@agent/guidance';

/** Callback type for emitting structured debug/observability events. */
export type SseEmitter = (event: string, data: unknown) => void;

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
  business: { id: string; name: string; description?: string | null };
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
  catalogSummary?: string;
  /** Inject a fake or test chat model (defaults to Gemini in production). */
  llm?: BaseChatModel;
  /** Select the LLM provider to use (defaults to 'openai' if OPENAI_API_KEY is set, otherwise 'gemini'). */
  llmProvider?: 'gemini' | 'openai';
  /** Override the default Messenger tool set (e.g. the comment tool set). */
  tools?: StructuredTool[];
  /** Override the default Messenger reply guidance in the system prompt. */
  replyGuidance?: string;
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
}

export class Agent {
  /** Every text that reached Messenger during `run()` — a reply, a card row, a button row. */
  sentTexts: string[] = [];
  /**
   * Whether the reply tool (`send_message`) was the thing that spoke. A closing line from the model is
   * worth sending after a card the customer cannot talk back to, and worth dropping after a reply that
   * already carried those exact words.
   */
  sentByReplyTool = false;

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

    const llm =
      this.config.llm ??
      (provider === 'openai'
        ? new ChatOpenAI({
            model: modelName,
            apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
            configuration: {
              baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
            },
            // gpt-6-luna is a reasoning deployment, and Azure says so with a 400 rather than a warning:
            // no temperature at all (anything but the server default is rejected) and
            // max_completion_tokens in place of max_tokens. Both messages came back from a real
            // customer turn, so this shape is proven rather than assumed.
            reasoning: { effort: 'medium' },
            maxCompletionTokens: 16384,
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
          emitSse,
          sendMessageOverride,
        },
        (text, kind) => {
          sentTexts.push(text);
          if (kind === 'reply') this.sentByReplyTool = true;
        },
      );

    const agent = createReactAgent({ llm, tools });

    const replyGuidance = this.config.replyGuidance ?? DEFAULT_REPLY_GUIDANCE;
    const systemContent = [
      this.config.systemPrompt,
      `You are a sales rep for ${this.config.business.name}.`,
      this.config.business.description ? `Business: ${this.config.business.description}` : '',
      this.config.catalogSummary ? `Catalog preview:\n${this.config.catalogSummary}` : '',
      replyGuidance,
    ]
      .filter(Boolean)
      .join('\n');

    console.log(`[agent] starting run — conversationId=${this.config.conversationId} historyLen=${this.config.history.length}`);
    emitSse?.('agent_start', {
      conversationId: this.config.conversationId,
      business: this.config.business.name,
      historyLen: this.config.history.length,
    });

    const messages: BaseMessage[] = [
      new SystemMessage(systemContent),
      ...(await this.historyMessages(canReadPhotos, provider === 'openai')),
    ];

    const result = await agent.invoke({ messages });
    const latencyMs = Date.now() - startTime;
    const lastMessage = result.messages[result.messages.length - 1];
    const replyText =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

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

