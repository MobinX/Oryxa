import { enrichedProductSpecsSchema, type EnrichedProductSpecs } from '@repo/shared';

export interface ProductEnrichmentInput {
  name: string;
  price: number | string;
  currency?: string;
  description?: string | null;
  categoryName?: string | null;
  variantNames?: string[];
  imageUrl?: string | null;
}

/**
 * One-time catalog enrichment via Microsoft Foundry `gpt-6-luna` ($0.05/M Batch/Flex, $0 per chat).
 * Generates structured highlights, realistic category-accurate materialAndFeel, occasionHooks,
 * and objectionCounters so the Closer never stalls on blank merchant product rows.
 */
export async function enrichProductSpecs(
  input: ProductEnrichmentInput,
  options: { apiKey?: string; baseUrl?: string; model?: string; fetcher?: typeof fetch } = {},
): Promise<EnrichedProductSpecs | null> {
  const apiKey = options.apiKey ?? process.env.AZURE_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) return null;

  const baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://oryxa.openai.azure.com/openai/v1').replace(/\/$/, '');
  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-6-luna';
  const fetcher = options.fetcher ?? fetch;

  const systemPrompt = [
    'You enrich Bangladeshi F-commerce product listings for a high-EQ sales closer.',
    'Return ONLY valid JSON matching: {"highlights": string[], "materialAndFeel": string, "occasionHooks": string[], "objectionCounters": string[]}.',
    'Rules:',
    '- highlights: 3-4 concise selling benefits in natural Dhaka Bangla + English.',
    '- materialAndFeel: realistic category-accurate fabric/build/usage feel inferred from brand/title/price tier (never invent absurd specs).',
    '- occasionHooks: 2-4 buyer occasions (e.g. "gf_gift", "Eid outfit", "office wear", "daily use").',
    '- objectionCounters: 2 concrete quality/value counter-points.',
  ].join('\n');

  const userPayload = JSON.stringify({
    name: input.name,
    price: input.price,
    currency: input.currency ?? 'BDT',
    category: input.categoryName ?? null,
    description: input.description ?? null,
    variants: (input.variantNames ?? []).slice(0, 12),
  });

  try {
    const res = await fetcher(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const rawText =
      data.output_text ??
      data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? '').join('') ??
      '';

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = enrichedProductSpecsSchema.safeParse(JSON.parse(jsonMatch[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
