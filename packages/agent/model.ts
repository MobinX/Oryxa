import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * The one place that decides which provider and model an agent runs on.
 *
 * V2 Production Stack runs exclusively on Microsoft Foundry (Azure credits) `gpt-6-luna`
 * (zero Gemini fallback).
 */
export type AgentProvider = 'openai' | 'gemini';

export function defaultAgentProvider(): AgentProvider {
  return 'openai';
}

/** The deployment name for the active store agent model (`OPENAI_MODEL`, default `gpt-6-luna`). */
export function agentModelName(_provider: AgentProvider = 'openai'): string {
  return process.env.OPENAI_MODEL || 'gpt-6-luna';
}

export interface StoreModelOptions {
  provider?: AgentProvider;
  /** Reasoning effort for OpenAI reasoning deployments (the store agent picks text/photo defaults). */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Provider-side prompt cache bucket; each agent surface gets its own. */
  promptCacheKey?: string;
}

/**
 * Resolves the active base URL for the store agent model.
 * When running on Microsoft Foundry / Azure with AZURE_API_KEY, protects against rogue
 * local proxies (e.g. 127.0.0.1 or api.openai.com) hijacking Azure traffic.
 */
export function resolveOpenAiBaseUrl(): string {
  if (process.env.AZURE_OPENAI_BASE_URL) {
    return process.env.AZURE_OPENAI_BASE_URL;
  }
  const configured = process.env.OPENAI_BASE_URL;
  if (
    process.env.AZURE_API_KEY &&
    (!configured || configured.includes('127.0.0.1') || configured.includes('localhost') || configured.includes('api.openai.com'))
  ) {
    return 'https://oryxa.openai.azure.com/openai/v1';
  }
  return configured || 'https://oryxa.openai.azure.com/openai/v1';
}

/**
 * A chat model built from Microsoft Foundry / Azure OpenAI credentials:
 * `AZURE_API_KEY`/`OPENAI_API_KEY` + `OPENAI_BASE_URL` on the Responses API.
 */
export function createStoreAgentModel(options: StoreModelOptions = {}): BaseChatModel {
  return new ChatOpenAI({
    model: agentModelName(options.provider ?? defaultAgentProvider()),
    apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: resolveOpenAiBaseUrl(),
    },
    // The Responses API forwards `reasoning` to a reasoning deployment without setting `max_tokens`.
    reasoning: { effort: options.reasoningEffort ?? 'low' },
    promptCacheKey: options.promptCacheKey,
    useResponsesApi: true,
  });
}
