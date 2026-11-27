import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyTurnDecision,
  extractSalesPlan,
  mergeSalesPlan,
  CLOSER_V2_PROMPT,
  CLOSER_V2_MESSENGER_GUIDANCE,
} from '@repo/shared';
import { extractQuickReplies } from '@repo/agent';
import { renderVisualResponse } from '@repo/integrations/visual-renderer';
import { transcribeAudio } from '@repo/integrations/azure-speech';

describe('OnlyOrders V2 Decision Router', () => {
  it('sends Azure Foundry systemone payload with api-key header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, any> = {};

    const mockFetch = vi.fn(async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          answers: {
            browse: { noul: 0.92 },
            quote: { noul: 0.1 },
            checkout: { noul: 0.05 },
            tracking: { noul: 0.01 },
            policy: { noul: 0.02 },
            escalate: { noul: 0.01 },
            chitchat: { noul: 0.1 },
            sales_stage: { choice: 'discovery' },
            ui_action: { choice: 'send_product_carousel' },
            template_route: { choice: 'show_category_products', confidence: 0.95 },
          },
          usage: { prompt_tokens: 120 },
        }),
        { status: 200 },
      );
    });

    const res = await classifyTurnDecision(
      { latestMessage: 'Saree dekhao', hasImages: false },
      {
        provider: 'azure',
        azureEndpoint: 'https://test-foundry.services.ai.azure.com',
        azureApiKey: 'test-azure-key',
        azureDeployment: 'Microsoft-Decision-1.1',
        fetcher: mockFetch as any,
      },
    );

    expect(capturedUrl).toBe('https://test-foundry.services.ai.azure.com/providers/microsoft/v1/systemone');
    expect(capturedHeaders['api-key']).toBe('test-azure-key');
    expect(capturedBody.model).toBe('Microsoft-Decision-1.1');
    expect(res.source).toBe('azure');
    expect(res.template_route).toBe('show_category_products');
    expect(res.sales_stage).toBe('discovery');
    expect(res.ui_action).toBe('send_product_carousel');
  });

  it('fails over automatically to Jev 1.14 when Azure returns 500', async () => {
    const mockFetch = vi.fn(async (url: any) => {
      if (String(url).includes('azure.com')) {
        return new Response('azure error', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          answers: {
            policy: { noul: 0.91 },
            sales_stage: { choice: 'pitch' },
            ui_action: { choice: 'text_only' },
            template_route: { choice: 'show_delivery_charges', confidence: 0.93 },
          },
        }),
        { status: 200 },
      );
    });

    const res = await classifyTurnDecision(
      { latestMessage: 'Sylhet delivery charge koto?' },
      {
        provider: 'azure',
        azureEndpoint: 'https://test.openai.azure.com',
        azureApiKey: 'az-key',
        jevApiKey: 'jev-key',
        fetcher: mockFetch as any,
      },
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.source).toBe('jev');
    expect(res.template_route).toBe('show_delivery_charges');
  });

  it('returns safe needs_llm_closer fallback on timeout', async () => {
    const mockFetch = vi.fn(
      (_url: any, init: any) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const res = await classifyTurnDecision(
      { latestMessage: 'hello' },
      {
        provider: 'azure',
        azureEndpoint: 'https://test.openai.azure.com',
        azureApiKey: 'az-key',
        timeoutMs: 15,
        fetcher: mockFetch as any,
      },
    );

    expect(res.source).toBe('fallback');
    expect(res.template_route).toBe('needs_llm_closer');
  });
});

describe('OnlyOrders V2 Plan & Chips Parsers + Prompt Hygiene', () => {
  it('extracts and strips <<CHIPS>> and <<PLAN>> cleanly and merges salesPlan', () => {
    const raw =
      'ভাইয়া, girlfriend-এর জন্য এই combo-টা দারুণ হবে ❤️ কোন shade নিবেন?\n<<CHIPS: Ruby Woo | Velvet Teddy>>\n<<PLAN: stage="pitch" next="lock_shade_and_address" occasion="gf_gift" budget="3000" priority="Lipstick Combo">>';

    const { text: afterChips, chips } = extractQuickReplies(raw);
    const { text: finalClean, plan } = extractSalesPlan(afterChips);

    expect(chips).toEqual(['Ruby Woo', 'Velvet Teddy']);
    expect(finalClean).toBe('ভাইয়া, girlfriend-এর জন্য এই combo-টা দারুণ হবে ❤️ কোন shade নিবেন?');
    expect(plan).toMatchObject({ stage: 'pitch', occasion: 'gf_gift', budget: '3000' });

    const merged = mergeSalesPlan(undefined, plan);
    expect(merged.stage).toBe('pitch');
    expect(merged.nextMove).toBe('lock_shade_and_address');
    expect(merged.buyerClues.occasion).toBe('gf_gift');
    expect(merged.buyerClues.budgetBdt).toBe(3000);
    expect(merged.buyerClues.priorityItem).toBe('Lipstick Combo');
  });

  it('keeps CLOSER_V2_PROMPT free of em dashes and dead legacy tool names', () => {
    const combined = `${CLOSER_V2_PROMPT}\n${CLOSER_V2_MESSENGER_GUIDANCE}`;
    expect(combined).not.toContain('—');
    expect(combined).not.toContain('getProductInfoWithQuery');
    expect(combined).not.toContain('show_products');
    expect(combined).not.toContain('send_suggestions');
    expect(combined).toContain('browse_catalog');
    expect(combined).toContain('get_product_quote');
    expect(combined).toContain('place_order');
  });
});

describe('OnlyOrders V2 Visual Renderer (WhatsApp 1-card Guard)', () => {
  const sampleCard = {
    productId: 'p1',
    title: 'Semi-Fit Cotton Panjabi',
    subtitle: 'BDT 1,350 · Maroon, Black',
    priceText: 'BDT 1,350',
    imageUrl: 'https://cdn.example.com/p1.png',
    orderPayload: 'place order with p1 and Panjabi',
    detailsPayload: 'DETAILS_p1',
  };

  it('auto-downgrades 1-card WhatsApp response to single_image_buttons', () => {
    const res = renderVisualResponse('whatsapp', {
      leadText: 'Here is our Cotton Panjabi',
      cards: [sampleCard],
    });

    expect(res.channel).toBe('whatsapp');
    if (res.channel === 'whatsapp') {
      expect(res.mode).toBe('single_image_buttons');
      expect((res.payload as any)?.interactive?.type).toBe('button');
    }
  });

  it('uses carousel mode when WhatsApp has 2+ cards', () => {
    const res = renderVisualResponse('whatsapp', {
      leadText: 'Top picks',
      cards: [sampleCard, { ...sampleCard, productId: 'p2', title: 'Linen Panjabi' }],
    });

    expect(res.channel).toBe('whatsapp');
    if (res.channel === 'whatsapp') {
      expect(res.mode).toBe('carousel');
      expect((res.payload as any)?.interactive?.type).toBe('carousel');
    }
  });
});

describe('Azure Speech F0 Free Tier Support', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses F0 Short Audio REST endpoint when AZURE_SPEECH_TIER=f0', async () => {
    const prevKey = process.env.AZURE_SPEECH_KEY;
    const prevTier = process.env.AZURE_SPEECH_TIER;
    const prevRegion = process.env.AZURE_SPEECH_REGION;

    process.env.AZURE_SPEECH_KEY = 'f0-test-key';
    process.env.AZURE_SPEECH_TIER = 'f0';
    process.env.AZURE_SPEECH_REGION = 'southeastasia';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'ভাই দাম কত?' }), {
        status: 200,
      }),
    );

    try {
      const text = await transcribeAudio(Buffer.from('fake-wav-bytes'), 'audio/wav');
      expect(text).toBe('ভাই দাম কত?');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
        'https://southeastasia.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1',
      );
    } finally {
      process.env.AZURE_SPEECH_KEY = prevKey;
      process.env.AZURE_SPEECH_TIER = prevTier;
      process.env.AZURE_SPEECH_REGION = prevRegion;
    }
  });
});
