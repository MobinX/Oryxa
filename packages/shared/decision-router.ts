/**
 * Unified Decision Router — Microsoft Foundry (primary) + TypeSafe Jev (failover).
 *
 * Provider-agnostic System One classification behind one interface, plus the optional
 * Azure OpenAI /openai/v1/decisions visual-matching helper for >5 catalog image ranking.
 */

export type DecisionIntentFlag =
  | 'browse'
  | 'quote'
  | 'checkout'
  | 'tracking'
  | 'policy'
  | 'escalate'
  | 'chitchat';

export type DecisionSalesStage =
  | 'hook'
  | 'discovery'
  | 'pitch'
  | 'price_objection'
  | 'trust_objection'
  | 'closing'
  | 'post_order'
  | 'explicit_refusal';

export type DecisionUiAction =
  | 'text_only'
  | 'send_category_chips'
  | 'send_product_carousel'
  | 'send_single_card_image'
  | 'send_order_card';

export type DecisionTemplateRoute =
  | 'greeting_with_categories'
  | 'show_category_products'
  | 'show_delivery_charges'
  | 'show_payment_methods'
  | 'show_order_status'
  | 'needs_llm_closer'
  | 'cannot_tell';

export interface DecisionResult {
  intents: DecisionIntentFlag[];
  sales_stage: DecisionSalesStage;
  ui_action: DecisionUiAction;
  template_route: DecisionTemplateRoute;
  confidence: number;
  quoteScore: number;
  source: 'azure' | 'jev' | 'fallback';
  latencyMs: number;
  inputTokens: number;
  estimatedCostUsd: number;
  rawAnswers?: Record<string, unknown>;
}

export interface DecisionRouterOptions {
  provider?: 'azure' | 'jev';
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  jevBaseUrl?: string;
  jevApiKey?: string;
  jevModel?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export const DEFAULT_DECISION_TIMEOUT_MS = 1500;
export const DECISION_COST_PER_MILLION_INPUT_USD = 0.042;

const INTENT_KEYS: DecisionIntentFlag[] = [
  'browse',
  'quote',
  'checkout',
  'tracking',
  'policy',
  'escalate',
  'chitchat',
];

const VALID_SALES_STAGES = new Set<DecisionSalesStage>([
  'hook',
  'discovery',
  'pitch',
  'price_objection',
  'trust_objection',
  'closing',
  'post_order',
  'explicit_refusal',
]);

const VALID_UI_ACTIONS = new Set<DecisionUiAction>([
  'text_only',
  'send_category_chips',
  'send_product_carousel',
  'send_single_card_image',
  'send_order_card',
]);

const VALID_TEMPLATE_ROUTES = new Set<DecisionTemplateRoute>([
  'greeting_with_categories',
  'show_category_products',
  'show_delivery_charges',
  'show_payment_methods',
  'show_order_status',
  'needs_llm_closer',
  'cannot_tell',
]);

export const DECISION_QUESTIONS = {
  browse: {
    type: 'noul',
    instructions: 'Does the customer want to search, see catalog products, view photos, or check available categories?',
  },
  quote: {
    type: 'noul',
    instructions: 'Does the customer ask for product price, colors, sizes, stock, material, or custom product attributes?',
  },
  checkout: {
    type: 'noul',
    instructions: 'Does the customer want to place an order, buy, confirm purchase, or give delivery address or phone number?',
  },
  tracking: {
    type: 'noul',
    instructions: 'Does the customer ask to track an order, check order status, cancel, or modify an existing order?',
  },
  policy: {
    type: 'noul',
    instructions: 'Does the customer ask about delivery zones, payment methods, return policy, or store location?',
  },
  escalate: {
    type: 'noul',
    instructions: 'Does the customer ask to speak with a human or manager, submit a complaint, or dispute a failed transaction?',
  },
  chitchat: {
    type: 'noul',
    instructions: 'Is this message a casual greeting, thank you, acknowledgment, or conversational remark without a shopping action?',
  },
  sales_stage: {
    type: 'choice',
    options: ['hook', 'discovery', 'pitch', 'price_objection', 'trust_objection', 'closing', 'post_order', 'explicit_refusal'],
    instructions: 'Current sales stage of the conversation.',
  },
  ui_action: {
    type: 'choice',
    options: ['text_only', 'send_category_chips', 'send_product_carousel', 'send_single_card_image', 'send_order_card'],
    instructions: 'Best UI action for this turn.',
  },
  template_route: {
    type: 'choice',
    options: [
      'greeting_with_categories',
      'show_category_products',
      'show_delivery_charges',
      'show_payment_methods',
      'show_order_status',
      'needs_llm_closer',
      'cannot_tell',
    ],
    instructions: 'Deterministic fast-path route or needs_llm_closer (choose cannot_tell or needs_llm_closer when uncertain).',
  },
};

function buildStateString(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    if (typeof o.state === 'string') return o.state;
    const latest = o.latestMessage ?? o.text ?? o.message ?? '';
    const lastTurns = Array.isArray(o.lastTurns) ? o.lastTurns : (Array.isArray(o.history) ? o.history : []);
    const compact = o.compactAgentState ?? o.compactState ?? '';
    const cats = o.availableCategories ?? o.categories ?? [];
    const hasImages = Boolean(o.hasImages);
    return JSON.stringify({
      latestMessage: latest,
      lastTurns: lastTurns.slice(-3),
      compactAgentState: compact,
      availableCategories: cats,
      hasImages,
    });
  }
  return String(input ?? '');
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function toResult(
  answers: Record<string, any>,
  source: DecisionResult['source'],
  started: number,
  stateStr: string,
  reportedInputTokens?: number,
): DecisionResult {
  const intents: DecisionIntentFlag[] = [];
  let maxScore = 0;

  for (const key of INTENT_KEYS) {
    const v = answers?.[key];
    const score = typeof v?.noul === 'number' ? v.noul : (typeof v?.score === 'number' ? v.score : undefined);
    if (typeof score === 'number') {
      if (score >= 0.5) intents.push(key);
      if (score > maxScore) maxScore = score;
    }
  }

  if (intents.length === 0) {
    const scored = INTENT_KEYS
      .map((k) => ({ k, s: typeof answers?.[k]?.noul === 'number' ? answers[k].noul : 0 }))
      .sort((a, b) => b.s - a.s);
    if (scored[0].s >= 0.35) intents.push(scored[0].k);
  }
  if (intents.length === 0) intents.push('chitchat');

  const rawStage = answers?.sales_stage?.choice as DecisionSalesStage;
  const sales_stage: DecisionSalesStage = VALID_SALES_STAGES.has(rawStage) ? rawStage : 'hook';

  const rawUi = answers?.ui_action?.choice as DecisionUiAction;
  const ui_action: DecisionUiAction = VALID_UI_ACTIONS.has(rawUi) ? rawUi : 'text_only';

  const rawRoute = answers?.template_route?.choice as DecisionTemplateRoute;
  const template_route: DecisionTemplateRoute = VALID_TEMPLATE_ROUTES.has(rawRoute)
    ? rawRoute
    : 'needs_llm_closer';

  const routeAnswer = answers?.template_route;
  const explicitRouteConfidence =
    typeof routeAnswer?.confidence === 'number'
      ? routeAnswer.confidence
      : typeof routeAnswer?.score === 'number'
        ? routeAnswer.score
        : typeof routeAnswer?.probabilities?.[template_route] === 'number'
          ? routeAnswer.probabilities[template_route]
          : undefined;

  const confidence = explicitRouteConfidence ?? (maxScore > 0 ? maxScore : 0.5);
  const quoteRaw = answers?.quote;
  const quoteScore = typeof quoteRaw?.noul === 'number' ? quoteRaw.noul : (typeof quoteRaw?.score === 'number' ? quoteRaw.score : 0);

  const inputTokens = typeof reportedInputTokens === 'number' && reportedInputTokens > 0
    ? reportedInputTokens
    : estimateTokens(stateStr);
  const estimatedCostUsd = Number(((inputTokens / 1_000_000) * DECISION_COST_PER_MILLION_INPUT_USD).toFixed(6));

  return {
    intents,
    sales_stage,
    ui_action,
    template_route,
    confidence,
    quoteScore,
    source,
    latencyMs: Date.now() - started,
    inputTokens,
    estimatedCostUsd,
    rawAnswers: answers,
  };
}

async function callAzure(
  stateStr: string,
  opts: DecisionRouterOptions,
  fetcher: typeof fetch,
  started: number,
  timeoutMs: number,
): Promise<DecisionResult> {
  const endpoint = (opts.azureEndpoint ?? process.env.AZURE_FOUNDRY_ENDPOINT ?? '').replace(/\/$/, '');
  const apiKey = opts.azureApiKey ?? process.env.AZURE_API_KEY ?? '';
  if (!endpoint || !apiKey) {
    throw new Error('Azure Foundry endpoint or api-key not configured');
  }
  const deployment = opts.azureDeployment ?? process.env.AZURE_DECISION_DEPLOYMENT ?? 'Microsoft-Decision-1.1';
  const url = `${endpoint}/providers/microsoft/v1/systemone`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ model: deployment, state: stateStr, questions: DECISION_QUESTIONS }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`azure ${res.status}`);
    const json = (await res.json()) as {
      answers?: Record<string, unknown>;
      usage?: { prompt_tokens?: number; input_tokens?: number };
    };
    const answers = (json?.answers ?? json) as Record<string, unknown>;
    const reportedTokens = json?.usage?.prompt_tokens ?? json?.usage?.input_tokens;
    return toResult(answers, 'azure', started, stateStr, reportedTokens);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function callJev(
  stateStr: string,
  opts: DecisionRouterOptions,
  fetcher: typeof fetch,
  started: number,
  timeoutMs: number,
): Promise<DecisionResult> {
  const baseUrl = (opts.jevBaseUrl ?? process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai/v1').replace(/\/$/, '');
  const apiKey = opts.jevApiKey ?? process.env.TYPESAFE_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('TypeSafe Jev API key not configured');
  }
  const model = opts.jevModel ?? process.env.JEV_MODEL ?? 'jev-1.14.0';
  const url = `${baseUrl}/systemone`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, state: stateStr, questions: DECISION_QUESTIONS }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`jev ${res.status}`);
    const json = (await res.json()) as {
      answers?: Record<string, unknown>;
      usage?: { prompt_tokens?: number; input_tokens?: number };
    };
    const answers = (json?.answers ?? json) as Record<string, unknown>;
    const reportedTokens = json?.usage?.prompt_tokens ?? json?.usage?.input_tokens;
    return toResult(answers, 'jev', started, stateStr, reportedTokens);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export async function classifyTurnDecision(
  input: unknown,
  options: DecisionRouterOptions = {},
): Promise<DecisionResult> {
  const started = Date.now();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS;
  const stateStr = buildStateString(input);
  const provider = options.provider ?? (process.env.DECISION_PROVIDER === 'jev' ? 'jev' : 'azure');

  if (provider === 'jev') {
    try {
      return await callJev(stateStr, options, fetcher, started, timeoutMs);
    } catch {
      /* fall through to safe deterministic fallback */
    }
  } else {
    try {
      return await callAzure(stateStr, options, fetcher, started, timeoutMs);
    } catch {
      if (options.jevApiKey ?? process.env.TYPESAFE_API_KEY) {
        try {
          return await callJev(stateStr, options, fetcher, started, timeoutMs);
        } catch {
          /* fall through to safe deterministic fallback */
        }
      }
    }
  }

  return {
    intents: ['chitchat'],
    sales_stage: 'hook',
    ui_action: 'text_only',
    template_route: 'needs_llm_closer',
    confidence: 0.5,
    quoteScore: 0,
    source: 'fallback',
    latencyMs: Date.now() - started,
    inputTokens: 0,
    estimatedCostUsd: 0,
  };
}

export interface VisualCandidate {
  productId: string;
  name: string;
  imageUrl: string;
}

export interface VisualMatchOptions {
  customerImageDataUrl: string;
  candidates: VisualCandidate[];
  openaiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

/**
 * Optional heavy visual matching specialist on Azure OpenAI `/openai/v1/decisions` (`gpt-6-luna`).
 * Only invoked when a customer uploads an unlabeled product photo with no 5-char stamp code
 * and there are >5 candidate catalog images to rank in one pass.
 */
export async function rankCatalogImagesWithDecisions(
  options: VisualMatchOptions,
): Promise<{ matchedProductId: string | null; rankedProductIds: string[] }> {
  if (options.candidates.length <= 5) {
    return {
      matchedProductId: options.candidates[0]?.productId ?? null,
      rankedProductIds: options.candidates.map((c) => c.productId),
    };
  }

  const baseUrl = (options.openaiBaseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://oryxa.openai.azure.com/openai/v1').replace(/\/$/, '');
  const apiKey = options.apiKey ?? process.env.AZURE_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) {
    return { matchedProductId: null, rankedProductIds: [] };
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-6-luna';
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const limited = options.candidates.slice(0, 128);
  try {
    const res = await fetcher(`${baseUrl}/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        input: {
          customerImage: options.customerImageDataUrl,
          candidates: limited.map((c) => ({ id: c.productId, name: c.name, imageUrl: c.imageUrl })),
        },
        questions: {
          best_match: {
            type: 'choice',
            options: [...limited.map((c) => c.productId), 'none'],
            instructions: 'Pick the catalog product ID whose image best matches the customer photo, or none.',
          },
          ...Object.fromEntries(
            limited.slice(0, 20).map((c) => [
              `match_${c.productId}`,
              { type: 'predicate', instructions: `Does candidate ${c.name} visually match the customer photo?` },
            ]),
          ),
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { matchedProductId: null, rankedProductIds: [] };
    const json = (await res.json()) as { answers?: Record<string, { choice?: string; predicate?: boolean }> };
    const best = json?.answers?.best_match?.choice;
    const matchedProductId = best && best !== 'none' ? best : null;
    const rankedProductIds = limited
      .filter((c) => json?.answers?.[`match_${c.productId}`]?.predicate === true)
      .map((c) => c.productId);
    if (matchedProductId && !rankedProductIds.includes(matchedProductId)) {
      rankedProductIds.unshift(matchedProductId);
    }
    return { matchedProductId, rankedProductIds };
  } catch {
    clearTimeout(timer);
    return { matchedProductId: null, rankedProductIds: [] };
  }
}

// alias for compatibility
export const classifyTurnDecisionHybrid = classifyTurnDecision;
