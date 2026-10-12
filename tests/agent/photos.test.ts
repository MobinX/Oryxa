import { describe, it, expect } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { photoBlock } from '@repo/agent/Agent';

describe('photoBlock', () => {
  it('gives Chat Completions the block it accepts', () => {
    expect(photoBlock('image/jpeg', 'aGk=', true)).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,aGk=' },
    });
  });

  it('gives the Gemini adapter the standard block', () => {
    expect(photoBlock('image/png', 'aGk=', false)).toEqual({
      type: 'image',
      data: 'aGk=',
      mimeType: 'image/png',
    });
  });

  /**
   * The outage this guards: a standard `{type:'image'}` block reached Azure untouched and every
   * photo turn came back `400 Invalid value: 'image'`, so the customer got no reply at all. The
   * adapter is the only place that decides, so the assertion is made on the bytes it writes.
   */
  it('reaches the wire as image_url, never as a bare image part', async () => {
    let sent: unknown = null;
    const model = new ChatOpenAI({
      model: 'gpt-5-mini',
      apiKey: 'not-a-real-key',
      configuration: {
        baseURL: 'http://127.0.0.1:9/v1',
        fetch: (async (_url: string, init: RequestInit) => {
          sent = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              id: 'x',
              object: 'chat.completion',
              created: 0,
              choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }) as unknown as typeof fetch,
      },
    });

    await model.invoke([
      new HumanMessage({ content: [{ type: 'text', text: 'look at this' }, photoBlock('image/jpeg', 'aGk=', true)] }),
    ]);

    const parts = (sent as { messages: { content: unknown }[] }).messages[0].content;
    expect(Array.isArray(parts)).toBe(true);
    expect((parts as { type: string }[]).map((p) => p.type)).toEqual(['text', 'image_url']);
  }, 20_000);
});
