import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { contentText } from '@repo/agent/Agent';
import type { ChatHistoryTurn } from '@repo/shared';

export type ChatProvider = 'openai' | 'gemini';

/** Same selection rule as every other model call: OpenAI keys win, else Gemini. */
export function chatProvider(): ChatProvider {
  return process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini';
}

export function chatModelName(provider: ChatProvider): string {
  return provider === 'openai' ? process.env.OPENAI_MODEL || 'gpt-6-luna' : 'gemini-flash-lite-latest';
}

/** False when no model key is configured at all — the route answers 503 then. */
export function chatConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY || process.env.GEMINI_API_KEY);
}

function getChatLlm() {
  const provider = chatProvider();
  if (provider === 'openai') {
    return new ChatOpenAI({
      model: chatModelName(provider),
      apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1',
      },
      // Chat answers are short lookups, not reasoning work — keep it cheap.
      reasoning: { effort: 'low' },
      useResponsesApi: true,
    });
  }
  return new ChatGoogleGenerativeAI({
    model: chatModelName(provider),
    apiKey: process.env.GEMINI_API_KEY || 'fake-key',
    temperature: 0.3,
    maxOutputTokens: 200,
  });
}

export type PlanFacts = {
  name: string;
  priceCents: number;
  messageLimit: number | null;
  assistantLimit: number | null;
};

function priceLabel(cents: number): string {
  if (cents === 0) return 'free';
  return '$' + (cents / 100).toFixed(0) + '/month';
}

function planLines(plans: PlanFacts[]): string {
  if (plans.length === 0) return 'Plans are not published right now.';
  return plans
    .map((p) => {
      const replies = p.messageLimit === null ? 'unlimited' : String(p.messageLimit);
      const chats = p.assistantLimit === null ? 'unlimited' : String(p.assistantLimit);
      return '- ' + p.name + ': ' + priceLabel(p.priceCents) + '; ' + replies + ' AI replies per 30 days; ' + chats + ' assistant chats per 30 days';
    })
    .join('\n');
}

function replyLang(lang: 'en' | 'bn'): string {
  return lang === 'bn'
    ? 'Always reply in Bengali (Bangla). Use English only for product names, button labels and URLs.'
    : 'Always reply in English.';
}

function scopeGuard(company: string): string {
  return 'You are the sales assistant for ' + company + '. Only answer questions about plans, pricing, features, registration and how to use it. If asked about anything else, politely say you can only help with questions about this product.';
}

const LINK_RULE = 'Only ever link these paths: / (home), /pricing (pricing), /docs (docs), /login (sign in and registration), /contact (contact). Never invent another URL.';

const SHORT_RULE = 'Keep every answer short: one to three sentences, no fluff. End with the single most useful next step.';

/** What the bot knows: live plan rows plus how a visitor becomes a merchant. */
export function buildPublicSystemPrompt(company: string, lang: 'en' | 'bn', plans: PlanFacts[]): string {
  const product =
    company + ' auto-answers DMs and comments on Messenger, Instagram and WhatsApp — live catalog checks, order capture and human handoff, all from one inbox.';
  const register =
    'Registration: press Get started to open /login, continue with Google or sign up with email, then create your store. Next connect a Facebook, Instagram or WhatsApp channel and import your catalog — the AI starts answering customer chats from there.';
  return [replyLang(lang), scopeGuard(company), product, 'Plans (per 30 days):\n' + planLines(plans), register, LINK_RULE, SHORT_RULE].join('\n\n');
}

/** The merchant already has a store: help them run it, not sell it to them. */
export function buildAssistantSystemPrompt(company: string, lang: 'en' | 'bn', planName: string | null): string {
  const context =
    'The user is already a merchant' + (planName ? ' on the ' + planName + ' plan' : '') + '. Help them run their store: orders, products, channels, payments, billing. They can change plan on the Billing page.';
  return [replyLang(lang), scopeGuard(company), context, LINK_RULE, SHORT_RULE].join('\n\n');
}

export type ChatTurnUsage = {
  provider: ChatProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

/** One grounded turn: system prompt, client-kept history, the new message. */
export async function runChatTurn(
  system: string,
  history: ChatHistoryTurn[],
  message: string,
): Promise<{ text: string; usage: ChatTurnUsage }> {
  const provider = chatProvider();
  const llm = getChatLlm();
  const messages = [
    { role: 'system' as const, content: system },
    ...history.map((t) => (t.role === 'assistant' ? new AIMessage(t.content) : new HumanMessage(t.content))),
    new HumanMessage(message),
  ];

  const start = Date.now();
  const res = await llm.invoke(messages);
  const text = contentText(res.content).trim();
  if (!text) throw new Error('Empty model reply');

  const meta = res.usage_metadata;
  return {
    text,
    usage: {
      provider,
      model: chatModelName(provider),
      inputTokens: meta?.input_tokens ?? 0,
      outputTokens: meta?.output_tokens ?? 0,
      latencyMs: Date.now() - start,
    },
  };
}

/**
 * Repeat-question cache for the public door: the same one-liner asked twice
 * costs one model call, not two. The budget spend still happens per turn (so
 * the daily cap keeps working), but the second identical question is answered
 * from here with zero tokens. History turns are never cached — only
 * standalone questions (empty history). Per-instance memory is fine: a miss
 * just means one model call, never a wrong answer. Keyed by brand so tenants
 * never see each other's replies.
 */
const PUBLIC_CACHE_TTL_MS = 3_600_000;
const PUBLIC_CACHE_MAX = 200;
const publicCache = new Map<string, { text: string; at: number }>();

function publicCacheKey(company: string, lang: 'en' | 'bn', message: string): string {
  return lang + '|' + company.toLowerCase() + '|' + message.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getPublicCachedReply(company: string, lang: 'en' | 'bn', message: string): string | null {
  const key = publicCacheKey(company, lang, message);
  const hit = publicCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PUBLIC_CACHE_TTL_MS) {
    publicCache.delete(key);
    return null;
  }
  return hit.text;
}

export function setPublicCachedReply(company: string, lang: 'en' | 'bn', message: string, text: string): void {
  if (publicCache.size >= PUBLIC_CACHE_MAX) {
    const oldest = publicCache.keys().next();
    if (!oldest.done) publicCache.delete(oldest.value);
  }
  publicCache.set(publicCacheKey(company, lang, message), { text, at: Date.now() });
}
