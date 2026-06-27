import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredTool } from '@langchain/core/tools';
import { createAgentTools } from '@agent/tools';

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
}

const DEFAULT_REPLY_GUIDANCE = [
  'The customer may have sent several messages while you were away. Read all of them and reply once, addressing everything they asked. Do not reply message-by-message.',
  'Always use send_message to reply to the customer. Be helpful and concise.',
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
    const tools: StructuredTool[] =
      this.config.tools ??
      createAgentTools(
        {
          businessId: this.config.business.id,
          conversationId: this.config.conversationId,
          pageToken: this.config.pageToken,
          customerPlatformId: this.config.customerPlatformId,
          customerName: this.config.customerName,
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

    const messages = [
      new SystemMessage(systemContent),
      ...this.config.history
        .slice()
        .reverse()
        .map((m) =>
          m.from === 'customer'
            ? new HumanMessage(m.content)
            : new AIMessage(m.content),
        ),
    ];

    const result = await agent.invoke({ messages });
    const lastMessage = result.messages[result.messages.length - 1];
    return typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  }
}

