import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import {
  getModelBilling,
  ratesOf,
  tokenCostUsd,
  updateModelBilling,
} from '@repo/db/crud/model-billing';

describe('token pricing', () => {
  const rates = {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    cachedInputUsdPerMillion: 0.075,
  };

  it('prices cached reads at the cached rate and the rest at input', () => {
    expect(
      tokenCostUsd(
        { inputTokens: 1_000_000, outputTokens: 500_000, cacheHitTokens: 200_000 },
        rates,
      ),
    ).toBe(0.435);
  });

  it('clamps impossible cache counts instead of producing a negative bill', () => {
    expect(
      tokenCostUsd(
        { inputTokens: 100, outputTokens: 0, cacheHitTokens: 500 },
        rates,
      ),
    ).toBe(0.000008);
    expect(
      tokenCostUsd(
        { inputTokens: -10, outputTokens: -1, cacheHitTokens: 4 },
        rates,
      ),
    ).toBe(0);
  });
});

describe('the model billing row', () => {
  withPglite();

  it('starts with the current OpenAI estimate and saves operator rates', async () => {
    const initial = await getModelBilling();
    expect(initial.provider).toBe('openai');
    expect(initial.model).toBe('gpt-6-luna');
    expect(ratesOf(initial)).toEqual({
      inputUsdPerMillion: 0.15,
      outputUsdPerMillion: 0.6,
      cachedInputUsdPerMillion: 0.075,
    });

    const saved = await updateModelBilling({
      provider: 'openai',
      model: 'gpt-6-luna',
      inputUsdPerMillion: 2.5,
      outputUsdPerMillion: 10,
      cachedInputUsdPerMillion: 1.25,
    });
    expect(ratesOf(saved)).toEqual({
      inputUsdPerMillion: 2.5,
      outputUsdPerMillion: 10,
      cachedInputUsdPerMillion: 1.25,
    });
    expect(ratesOf(await getModelBilling())).toEqual(ratesOf(saved));
  });
});
