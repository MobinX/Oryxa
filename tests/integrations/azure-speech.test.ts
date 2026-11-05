import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudio } from '../../packages/integrations/azure-speech';
import { fetchMessengerAudio } from '../../packages/integrations/facebook';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const MP3 = Buffer.from('fake-audio-bytes');

function definitionOf(callIndex: number): Record<string, unknown> {
  const body = fetchMock.mock.calls[callIndex][1].body as FormData;
  return JSON.parse(body.get('definition') as string);
}

function okResponse(text: string): Response {
  return new Response(JSON.stringify({ combinedPhrases: [{ text }] }), { status: 200 });
}

describe('voice transcription (packages/integrations/azure-speech.ts)', () => {
  beforeEach(() => {
    vi.stubEnv('AZURE_SPEECH_KEY', 'test-key');
    vi.stubEnv('AZURE_SPEECH_ENDPOINT', 'https://speech.test');
    vi.stubEnv('AZURE_SPEECH_ENHANCED', '');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not pin a locale on the enhanced call, so any language is detected', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('Hello world'));
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBe('Hello world');
    const definition = definitionOf(0);
    expect(definition).not.toHaveProperty('locales');
    expect(definition).toHaveProperty('enhancedMode');
  });

  it('falls back to the multilingual call when enhanced returns no text', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('   '));
    fetchMock.mockResolvedValueOnce(okResponse('fallback text'));
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBe('fallback text');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(definitionOf(1)).toEqual({});
  });

  it('retries a throttled enhanced call and then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(new Response('throttled', { status: 429 }));
    fetchMock.mockResolvedValueOnce(okResponse('recovered'));
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400 rejection', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad audio', { status: 400 }));
    fetchMock.mockResolvedValueOnce(okResponse('standard fallback'));
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBe('standard fallback');
    // One enhanced attempt (no retry on 400) + one standard attempt.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when every attempt fails', async () => {
    vi.stubEnv('AZURE_SPEECH_ENHANCED', 'false');
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns null without calling Azure when no key is set', async () => {
    vi.stubEnv('AZURE_SPEECH_KEY', '');
    const text = await transcribeAudio(MP3, 'audio/mpeg');
    expect(text).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchMessengerAudio retry (packages/integrations/facebook.ts)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('retries once when the connection drops, then returns the audio', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mp4' } }),
    );
    const audio = await fetchMessengerAudio('https://cdn.example/voice.mp4');
    expect(audio).not.toBeNull();
    expect(audio?.buffer.byteLength).toBe(3);
    expect(audio?.contentType).toBe('audio/mp4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an HTTP error from Meta', async () => {
    fetchMock.mockResolvedValueOnce(new Response('expired', { status: 403 }));
    const audio = await fetchMessengerAudio('https://cdn.example/voice.mp4');
    expect(audio).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
