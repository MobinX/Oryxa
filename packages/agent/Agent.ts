import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
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
}

export class Agent {
  /** Texts the agent actually sent via the send_message tool during `run()`. */
  sentTexts: string[] = [];

  constructor(private config: AgentConfig) {}

  async run(): Promise<string> {
    const llm =
      this.config.llm ??
      new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash-lite',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.3,
      });

    const sentTexts = this.sentTexts;
    const tools = createAgentTools(
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

    const systemContent = [
      this.config.systemPrompt,
      `You are a sales rep for ${this.config.business.name}.`,
      this.config.business.description ? `Business: ${this.config.business.description}` : '',
      this.config.catalogSummary ? `Catalog preview:\n${this.config.catalogSummary}` : '',
      'Always use send_message to reply to the customer. Be helpful and concise.',
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
