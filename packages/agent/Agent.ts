import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredTool } from '@langchain/core/tools';
import { createAgentTools } from '@agent/tools';

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

const DEFAULT_REPLY_GUIDANCE = [
  'The customer may have sent several messages while you were away. Read all of them and reply once, addressing everything they asked. Do not reply message-by-message.',
  'Always use send_message to reply to the customer. Be helpful and concise.',
  'CRITICAL: You are only allowed to call the send_message tool ONCE per turn. Do not send multiple messages. Once you call send_message, do not call it or any other tools again. Stop and finish the turn immediately.',
  'ORDER MANAGEMENT: If the customer asks to edit details (such as address, phone number, or product count) of an order, or asks about order status/details:',
  '  1. Search the conversation history for any previously mentioned order ID (UUID).',
  '  2. Use the get_order tool to view the current details, or the update_order tool to change details (like address or phone).',
  '  3. Do NOT call create_order again. Creating a new order when one already exists in the history is a critical defect.',
  '  4. If the customer asks to cancel their order, search history for the order ID and use the cancel_order tool to mark the order as cancelled in the database. Always cancel/delete the order in the database when requested.',
].join('\n');

export class Agent {
  /** Texts the agent actually sent via the reply tool during `run()`. */
  sentTexts: string[] = [];

  constructor(private config: AgentConfig) {}

  async run(): Promise<string> {
    const llm =
      this.config.llm ??
      new ChatGoogleGenerativeAI({
        model: 'gemini-flash-lite-latest',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.3,
      });

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
    const lastMessage = result.messages[result.messages.length - 1];
    const replyText =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    console.log(`[agent] run complete — sentTexts=${sentTexts.length} finalReply="${replyText.slice(0, 120)}${replyText.length > 120 ? '…' : ''}"`);
    emitSse?.('reply', { text: replyText });

    return replyText;
  }
}
