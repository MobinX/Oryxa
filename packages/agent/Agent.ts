import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredTool } from '@langchain/core/tools';
import { createAgentTools } from '@agent/tools';
import { DEFAULT_REPLY_GUIDANCE } from '@agent/guidance';

/** Callback type for emitting structured debug/observability events. */
export type SseEmitter = (event: string, data: unknown) => void;

export interface AgentConfig {
  systemPrompt: string;
  business: { id: string; name: string; description?: string | null };
  history: Array<{ from: string; content: string }>;
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
  /** Texts the agent actually sent via the reply tool during `run()`. */
  sentTexts: string[] = [];

  constructor(private config: AgentConfig) {}

  async run(): Promise<AgentRunResult> {
    const startTime = Date.now();
    const provider =
      this.config.llmProvider ??
      (process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini');

    const modelName =
      provider === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-5-mini')
        : 'gemini-flash-lite-latest';

    const llm =
      this.config.llm ??
      (provider === 'openai'
        ? (() => {
            const model = modelName;
            const isReasoning = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('gpt-5');
            return new ChatOpenAI({
              model,
              apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
              configuration: {
                baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
              },
              temperature: isReasoning ? undefined : 0.3,
              maxTokens: 16384,
              modelKwargs: isReasoning ? { reasoning_effort: 'low' } : undefined,
            });
          })()
        : new ChatGoogleGenerativeAI({
            model: modelName,
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0.3,
          }));

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
        (text) => sentTexts.push(text),
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

    const messages = [
      new SystemMessage(systemContent),
      ...this.config.history
        .slice()
        .map((m) =>
          m.from === 'customer'
            ? new HumanMessage(m.content)
            : new AIMessage(m.content),
        ),
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
    
    // Estimate cost (Gemini: $0.075/1M in, $0.30/1M out; OpenAI gpt-5-mini: $0.15/1M in, $0.60/1M out)
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
}

