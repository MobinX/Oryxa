import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * The model the Official Channels pipeline talks to. The provider choice and every
 * env fallback mirror the store agent's own selection in Agent.ts, so both surfaces run
 * on the existing provider decision; tests inject a fake `BaseChatModel` here instead of
 * reaching the network.
 */

export type OfficialProvider = 'gemini' | 'openai';

export function defaultOfficialProvider(): OfficialProvider {
  return process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini';
}

export function createOfficialModel(options: {
  provider?: OfficialProvider;
} = {}): BaseChatModel {
  const provider = options.provider ?? defaultOfficialProvider();
  const modelName =
    provider === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-6-luna') : 'gemini-flash-lite-latest';

  if (provider === 'openai') {
    return new ChatOpenAI({
      model: modelName,
      apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
      },
      // One short structured call per turn; a reasoning deployment's low effort is the
      // cheapest honest answer here, exactly like the store agent's text turns.
      reasoning: { effort: 'low' },
      promptCacheKey: 'oryxa:official:v1',
      useResponsesApi: true,
    });
  }

  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
  });
}
