import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * The one place that decides which provider and model an agent runs on.
 *
 * The store agent's final reply and any helper agent a tool runs (product answers,
 * for instance) must bill the same account and answer with the same model. Copying
 * the `ChatOpenAI` options into a second file is how those two drift apart: a model
 * rename or a new Azure base URL would reach one surface and silently miss the other.
 */
export type AgentProvider = 'gemini' | 'openai';

export function defaultAgentProvider(): AgentProvider {
  return process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini';
}

/** The deployment name for a provider — `OPENAI_MODEL` (gpt-6-luna by default) or Gemini's lite model. */
export function agentModelName(provider: AgentProvider): string {
  return provider === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-6-luna')
    : 'gemini-flash-lite-latest';
}

export interface StoreModelOptions {
  provider?: AgentProvider;
  /** Reasoning effort for OpenAI reasoning deployments (the store agent picks text/photo defaults). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Provider-side prompt cache bucket; each agent surface gets its own. */
  promptCacheKey?: string;
}

/**
 * A chat model built from the same credentials the Messenger and comment agents already use:
 * `AZURE_API_KEY`/`OPENAI_API_KEY` + `OPENAI_BASE_URL` on the Responses API, or `GEMINI_API_KEY`
 * as the fallback when no OpenAI credential is configured.
 */
export function createStoreAgentModel(options: StoreModelOptions = {}): BaseChatModel {
  const provider = options.provider ?? defaultAgentProvider();

  if (provider === 'openai') {
    return new ChatOpenAI({
      model: agentModelName('openai'),
      apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
      },
      // The Responses API is the path that forwards `reasoning` to a reasoning deployment. On chat
      // completions LangChain names the reply cap from its own model test — o\d and gpt-5* — so a
      // deployment called gpt-6-luna gets `max_tokens`, which Azure rejects with a 400. No cap and
      // no temperature are set, which is what this model expects.
      reasoning: { effort: options.reasoningEffort ?? 'low' },
      promptCacheKey: options.promptCacheKey,
      useResponsesApi: true,
    });
  }

  return new ChatGoogleGenerativeAI({
    model: agentModelName('gemini'),
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
  });
}
