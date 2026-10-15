/**
 * One place to say how an Azure reasoning deployment is asked for a completion.
 *
 * The two parameters gpt-6-luna accepts cannot be requested through the fields named after them.
 * LangChain chooses between `max_tokens` and `max_completion_tokens` from its own model-name test,
 * which knows `o\d` and `gpt-5*` and nothing else — so a deployment named gpt-6-luna is handed
 * `max_tokens` whichever field is set, and Azure answers 400 Unsupported parameter. A temperature is
 * rejected the same way. `modelKwargs` is spread onto the request verbatim, so both settings ride it.
 *
 * Verified against the live endpoint rather than reasoned from the library: the outgoing body carries
 * `max_completion_tokens` and `reasoning_effort`, and neither `max_tokens` nor `temperature`.
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';
export const DEFAULT_OPENAI_BASE_URL = 'https://oryxa.openai.azure.com/openai/v1';

/** The reasoning effort every Oryxa call asks for. */
export const OPENAI_REASONING_EFFORT = 'medium';

export function openAIModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

export function openAIChatOptions(
  model: string,
  options: { maxCompletionTokens?: number } = {},
): {
  model: string;
  apiKey: string | undefined;
  configuration: { baseURL: string };
  modelKwargs: Record<string, string | number>;
} {
  return {
    model,
    apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL },
    modelKwargs: {
      reasoning_effort: OPENAI_REASONING_EFFORT,
      ...(options.maxCompletionTokens ? { max_completion_tokens: options.maxCompletionTokens } : {}),
    },
  };
}
