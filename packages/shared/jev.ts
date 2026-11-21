/**
 * TypeSafe AI (Jev) Semantic Intent Classifier & Hybrid Integration
 *
 * Implements System One classification (POST /v1/systemone) for OnlyOrders,
 * supporting multilingual (Bangla, Banglish, English), slang, and multi-intent queries.
 * Integrates deterministically with existing `classifyTurnIntent()`.
 */

import { classifyTurnIntent } from './language';

export type JevIntentCategory =
  | 'browse'
  | 'quote'
  | 'checkout'
  | 'tracking'
  | 'policy'
  | 'escalate'
  | 'chitchat'
  | 'general';

export interface JevClassificationResult {
  /** All detected intent categories matching confidence threshold */
  intents: JevIntentCategory[];
  /** Primary / highest confidence score (0.0 to 1.0) */
  confidence: number;
  /** Full probability distribution returned by Jev noul primitives */
  scores: Record<string, number>;
  /** Origin of the classification decision */
  source: 'deterministic' | 'jev' | 'fallback';
  /** Latency of classification in milliseconds */
  latencyMs: number;
  /** Raw answers map from Jev response if available */
  rawAnswers?: Record<string, unknown>;
}

export interface JevClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  confidenceThreshold?: number;
  /** Custom fetch implementation (useful for tests and mocks) */
  fetcher?: typeof fetch;
}

export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai/v1';
export const DEFAULT_JEV_MODEL = 'jev-latest';
export const DEFAULT_JEV_TIMEOUT_MS = 1800;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

/** Standard TypeSafe AI System One question definitions for OnlyOrders */
export const ONLYORDERS_JEV_QUESTIONS = {
  browse: {
    type: 'noul',
    instructions: 'Does the customer want to search, see catalog products, view photos, or check available categories?',
  },
  quote: {
    type: 'noul',
    instructions: 'Does the customer ask for product price, available colors, sizes, stock, or delivery charges for an item?',
  },
  checkout: {
    type: 'noul',
    instructions: 'Does the customer want to place an order, buy, confirm purchase, or give delivery address or phone number?',
  },
  tracking: {
    type: 'noul',
    instructions: 'Does the customer ask to track an order, check order status, cancel an order, or modify an existing order?',
  },
  policy: {
    type: 'noul',
    instructions: 'Does the customer ask about delivery zones, payment methods (bKash, Cash on delivery), return policy, or store location?',
  },
  escalate: {
    type: 'noul',
    instructions: 'Does the customer ask to speak with a human or manager, submit a complaint, or dispute a failed transaction?',
  },
  chitchat: {
    type: 'noul',
    instructions: 'Is this message a casual greeting, thank you, acknowledgment, or conversational remark without a shopping action?',
  },
};

/**
 * Direct call to TypeSafe AI System One API with timeout and graceful error recovery.
 */
export async function classifyWithJev(
  text: string,
  options: JevClientOptions = {}
): Promise<JevClassificationResult> {
  const started = Date.now();
  const apiKey =
    options.apiKey ??
    process.env.TYPESAFE_API_KEY ??
    process.env.JEV_API_KEY ??
    process.env.jev_api ??
    process.env.JEV_API;
  const baseUrl = (options.baseUrl ?? process.env.TYPESAFE_BASE_URL ?? DEFAULT_JEV_BASE_URL).replace(/\/$/, '');
  const model = options.model ?? process.env.JEV_MODEL ?? DEFAULT_JEV_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS;
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const fetcher = options.fetcher ?? fetch;

  if (!apiKey) {
    return {
      intents: ['general'],
      confidence: 0.5,
      scores: { general: 0.5 },
      source: 'fallback',
      latencyMs: Date.now() - started,
    };
  }

  const endpoint = `${baseUrl}/systemone`;
  const body = {
    model,
    state: text,
    questions: ONLYORDERS_JEV_QUESTIONS,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      console.warn(`[jev] API returned status ${response.status}: ${await response.text().catch(() => '')}`);
      return {
        intents: ['general'],
        confidence: 0.5,
        scores: { general: 0.5 },
        source: 'fallback',
        latencyMs: Date.now() - started,
      };
    }

    const json = (await response.json()) as {
      model?: string;
      answers?: Record<string, { type: string; noul?: number; choice?: string }>;
    };

    const answers = json.answers ?? {};
    const scores: Record<string, number> = {};
    const matchedIntents: JevIntentCategory[] = [];

    for (const [key, value] of Object.entries(answers)) {
      if (typeof value.noul === 'number') {
        scores[key] = value.noul;
        if (value.noul >= threshold && key in ONLYORDERS_JEV_QUESTIONS) {
          matchedIntents.push(key as JevIntentCategory);
        }
      }
    }

    // Determine highest confidence score
    const scoreValues = Object.values(scores);
    const maxScore = scoreValues.length > 0 ? Math.max(...scoreValues) : 0.5;

    // If no intent met the threshold, fallback to the top scoring intent or 'general'
    const finalIntents: JevIntentCategory[] =
      matchedIntents.length > 0
        ? matchedIntents
        : maxScore >= 0.35
          ? (Object.entries(scores)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 1)
              .map(([k]) => k as JevIntentCategory))
          : ['general'];

    return {
      intents: finalIntents,
      confidence: maxScore,
      scores,
      rawAnswers: answers,
      source: 'jev',
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    console.warn(`[jev] Classification failed or timed out (${timeoutMs}ms):`, err);
    return {
      intents: ['general'],
      confidence: 0.5,
      scores: { general: 0.5 },
      source: 'fallback',
      latencyMs: Date.now() - started,
    };
  }
}

/** Simple bare greeting / acknowledgement detection to save network calls */
const BARE_CHITCHAT_RE = /^(?:hi|hello|hey|assalamualaikum|slm|shob|ok|okay|accha|thik ache|thanks|thank you|dhonnobad|bye|kire)\b[!.?]*$/i;

/**
 * Hybrid Classifier combining existing deterministic signals with Jev semantic classification.
 *
 * Tier 1: Instant deterministic signals (<0.1ms, 0 tokens)
 *  - Friend tags (@mention) -> comment_silent
 *  - Order button taps -> checkout
 *  - Order tracking taps -> tracking
 *  - Explicit order cancel/update -> tracking
 *  - Bare greetings/acknowledgements -> chitchat
 *
 * Tier 2: Jev Semantic Classifier (TypeSafe AI)
 *  - Multi-intent detection
 *  - Multilingual Bangla, Banglish, English semantic understanding
 *  - Colloquial slang and spelling variations
 */
export async function classifyTurnHybrid(
  text: string,
  state?: any,
  options: JevClientOptions = {}
): Promise<JevClassificationResult> {
  const started = Date.now();
  const trimmed = (text || '').trim();

  // Tier 1: Check existing deterministic classifier
  const deterministicIntent = classifyTurnIntent(trimmed, state);

  if (deterministicIntent === 'comment_silent') {
    return {
      intents: ['chitchat'],
      confidence: 1.0,
      scores: { chitchat: 1.0 },
      source: 'deterministic',
      latencyMs: Date.now() - started,
    };
  }

  if (deterministicIntent === 'button_order') {
    return {
      intents: ['checkout'],
      confidence: 1.0,
      scores: { checkout: 1.0 },
      source: 'deterministic',
      latencyMs: Date.now() - started,
    };
  }

  if (deterministicIntent === 'order_track' || deterministicIntent === 'order_cancel' || deterministicIntent === 'order_update') {
    return {
      intents: ['tracking'],
      confidence: 1.0,
      scores: { tracking: 1.0 },
      source: 'deterministic',
      latencyMs: Date.now() - started,
    };
  }

  if (deterministicIntent === 'photo_code') {
    return {
      intents: ['quote'],
      confidence: 1.0,
      scores: { quote: 1.0 },
      source: 'deterministic',
      latencyMs: Date.now() - started,
    };
  }

  // Check bare greetings and thanks directly
  if (BARE_CHITCHAT_RE.test(trimmed)) {
    return {
      intents: ['chitchat'],
      confidence: 1.0,
      scores: { chitchat: 1.0 },
      source: 'deterministic',
      latencyMs: Date.now() - started,
    };
  }

  // Tier 2: Invoke Jev for semantic / multi-intent resolution
  const jevResult = await classifyWithJev(trimmed, options);
  return jevResult;
}
