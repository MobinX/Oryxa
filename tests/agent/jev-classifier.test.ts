import { describe, expect, it, vi } from 'vitest';
import {
  classifyWithJev,
  classifyTurnHybrid,
  DEFAULT_JEV_BASE_URL,
  DEFAULT_JEV_MODEL,
} from '@repo/shared';
import { selectToolsForTurn } from '@agent/tools';
import type { StructuredTool } from '@langchain/core/tools';

describe('Jev Semantic Classifier (TypeSafe AI Integration)', () => {
  it('formats request payload according to TypeSafe AI System One specification', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse(String(init?.body || '{}'));

      return new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            browse: { type: 'noul', noul: 0.1 },
            quote: { type: 'noul', noul: 0.94 },
            checkout: { type: 'noul', noul: 0.05 },
            tracking: { type: 'noul', noul: 0.02 },
            policy: { type: 'noul', noul: 0.2 },
            escalate: { type: 'noul', noul: 0.01 },
            chitchat: { type: 'noul', noul: 0.02 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await classifyWithJev('Ei Classic Oxford Shirt er dam koto? Black L available ache?', {
      apiKey: 'test-api-key',
      fetcher: mockFetcher as any,
    });

    expect(capturedUrl).toBe(`${DEFAULT_JEV_BASE_URL}/systemone`);
    expect(capturedHeaders['Authorization']).toBe('Bearer test-api-key');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedBody.model).toBe(DEFAULT_JEV_MODEL);
    expect(capturedBody.state).toBe('Ei Classic Oxford Shirt er dam koto? Black L available ache?');
    expect(capturedBody.questions.quote.type).toBe('noul');
    expect(result.source).toBe('jev');
    expect(result.intents).toContain('quote');
    expect(result.confidence).toBe(0.94);
  });

  it('detects multiple intents in a single compound message', async () => {
    const mockFetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            browse: { type: 'noul', noul: 0.15 },
            quote: { type: 'noul', noul: 0.91 },
            checkout: { type: 'noul', noul: 0.05 },
            tracking: { type: 'noul', noul: 0.88 },
            policy: { type: 'noul', noul: 0.1 },
            escalate: { type: 'noul', noul: 0.01 },
            chitchat: { type: 'noul', noul: 0.05 },
          },
        }),
        { status: 200 }
      );
    });

    const result = await classifyWithJev(
      'Classic Oxford Shirt er dam koto? Ar amar ager order #1084 ekhon kothay ache?',
      { apiKey: 'test-key', fetcher: mockFetcher as any }
    );

    expect(result.intents).toHaveLength(2);
    expect(result.intents).toContain('quote');
    expect(result.intents).toContain('tracking');
    expect(result.confidence).toBe(0.91);
  });

  it('handles Jev API failure gracefully and falls back without throwing', async () => {
    const mockFetcher = vi.fn(async () => {
      return new Response('Internal Server Error', { status: 500 });
    });

    const result = await classifyWithJev('hello', {
      apiKey: 'test-key',
      fetcher: mockFetcher as any,
    });

    expect(result.source).toBe('fallback');
    expect(result.intents).toContain('general');
    expect(result.confidence).toBe(0.5);
  });

  it('handles Jev timeout gracefully and falls back', async () => {
    const mockFetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(new Response('{}', { status: 200 }));
        }, 100);
        if (init?.signal?.aborted) {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const result = await classifyWithJev('hello', {
      apiKey: 'test-key',
      timeoutMs: 10,
      fetcher: mockFetcher as any,
    });

    expect(result.source).toBe('fallback');
    expect(result.intents).toContain('general');
  });
});

describe('Hybrid Classifier (Deterministic + Semantic)', () => {
  it('fast-paths Facebook button taps deterministically without invoking Jev', async () => {
    const mockFetcher = vi.fn();
    const result = await classifyTurnHybrid(
      'place order with 8f14e45f-ceea-467f-a8f0-000000000001 and Shirt',
      null,
      { apiKey: 'test-key', fetcher: mockFetcher as any }
    );

    expect(mockFetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('deterministic');
    expect(result.intents).toContain('checkout');
    expect(result.confidence).toBe(1.0);
  });

  it('fast-paths order tracking button taps deterministically', async () => {
    const mockFetcher = vi.fn();
    const result = await classifyTurnHybrid(
      'please track order with id 9a14e45f-ceea-467f-a8f0-000000000098',
      null,
      { apiKey: 'test-key', fetcher: mockFetcher as any }
    );

    expect(mockFetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('deterministic');
    expect(result.intents).toContain('tracking');
  });

  it('fast-paths comment friend tags deterministically', async () => {
    const mockFetcher = vi.fn();
    const result = await classifyTurnHybrid(
      '@Rafiq Ahmed dekh ei shirt ta tor jonno bhalo hobe',
      null,
      { apiKey: 'test-key', fetcher: mockFetcher as any }
    );

    expect(mockFetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('deterministic');
    expect(result.intents).toContain('chitchat');
  });

  it('fast-paths bare acknowledgements ("ok", "thanks", "hi") without network overhead', async () => {
    const mockFetcher = vi.fn();
    const result = await classifyTurnHybrid('ok', null, {
      apiKey: 'test-key',
      fetcher: mockFetcher as any,
    });

    expect(mockFetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('deterministic');
    expect(result.intents).toContain('chitchat');
  });

  it('routes natural language questions to Jev semantic classification', async () => {
    const mockFetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            browse: { type: 'noul', noul: 0.95 },
            quote: { type: 'noul', noul: 0.1 },
            checkout: { type: 'noul', noul: 0.05 },
            tracking: { type: 'noul', noul: 0.01 },
            policy: { type: 'noul', noul: 0.1 },
            escalate: { type: 'noul', noul: 0.01 },
            chitchat: { type: 'noul', noul: 0.05 },
          },
        }),
        { status: 200 }
      );
    });

    const result = await classifyTurnHybrid('bhai apnader shob saree er collection dekhte chai', null, {
      apiKey: 'test-key',
      fetcher: mockFetcher as any,
    });

    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('jev');
    expect(result.intents).toContain('browse');
    expect(result.confidence).toBe(0.95);
  });
});

describe('Dynamic Tool Selector', () => {
  const fakeTool = (name: string): StructuredTool =>
    ({
      name,
      description: `Mock tool for ${name}`,
      invoke: vi.fn(),
    }) as any;

  const mockRegistry: Record<string, StructuredTool> = {
    // Composite tools
    browse_catalog: fakeTool('browse_catalog'),
    get_product_quote: fakeTool('get_product_quote'),
    place_order: fakeTool('place_order'),
    get_order_status: fakeTool('get_order_status'),
    // Legacy tools
    show_products: fakeTool('show_products'),
    get_product: fakeTool('get_product'),
    create_order: fakeTool('create_order'),
    get_order: fakeTool('get_order'),
    // Core interaction tools
    send_suggestions: fakeTool('send_suggestions'),
    report_human_intervene: fakeTool('report_human_intervene'),
  };

  it('selects composite browsing and quote tools when intent is browse', () => {
    const selected = selectToolsForTurn({
      intents: ['browse'],
      allTools: mockRegistry,
      enableCompositeTools: true,
      maxTools: 4,
    });

    const names = selected.map((t) => t.name);
    expect(names).toContain('browse_catalog');
    expect(names).toContain('get_product_quote');
    expect(names).toContain('send_suggestions');
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it('selects place_order and quote tools when customer is in checkout intent', () => {
    const selected = selectToolsForTurn({
      intents: ['checkout'],
      allTools: mockRegistry,
      enableCompositeTools: true,
      maxTools: 4,
    });

    const names = selected.map((t) => t.name);
    expect(names).toContain('place_order');
    expect(names).toContain('get_product_quote');
    expect(names).toContain('send_suggestions');
  });

  it('selects tracking tools when intent is tracking', () => {
    const selected = selectToolsForTurn({
      intents: ['tracking'],
      allTools: mockRegistry,
      enableCompositeTools: true,
      maxTools: 4,
    });

    const names = selected.map((t) => t.name);
    expect(names).toContain('get_order_status');
    expect(names).toContain('send_suggestions');
  });

  it('combines multi-intent tools (quote + tracking) within the 4-tool safety budget', () => {
    const selected = selectToolsForTurn({
      intents: ['quote', 'tracking'],
      allTools: mockRegistry,
      enableCompositeTools: true,
      maxTools: 4,
    });

    const names = selected.map((t) => t.name);
    expect(names).toContain('get_product_quote');
    expect(names).toContain('get_order_status');
    expect(names).toContain('browse_catalog');
    expect(names).toContain('send_suggestions');
    expect(selected.length).toBe(4);
  });

  it('selects legacy granular tools when enableCompositeTools is false', () => {
    const selected = selectToolsForTurn({
      intents: ['browse'],
      allTools: mockRegistry,
      enableCompositeTools: false,
      maxTools: 4,
    });

    const names = selected.map((t) => t.name);
    expect(names).toContain('show_products');
    expect(names).toContain('get_product');
    expect(names).toContain('send_suggestions');
  });
});
