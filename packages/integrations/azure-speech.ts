/**
 * Voice messages become text through Azure's fast transcription API. Meta sends voice notes as
 * MP4/AAC (`video/mp4`); the enhanced mai-transcribe-2 model rejects that container outright
 * ("Format not recognised"), while the standard multilingual model transcribes it, mixed
 * Bangla/English included, when no locale is pinned. So the working call is the multilingual
 * one; enhanced mode stays available behind AZURE_SPEECH_ENHANCED=true and falls back.
 *
 * The caller gets the transcript or null; a failed transcription never blocks the webhook —
 * the agent is simply told the voice message could not be read.
 */

const DEFAULT_ENDPOINT = 'https://oryxa.cognitiveservices.azure.com';
const API_VERSION = '2025-10-15';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function extensionFor(contentType: string): string {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('ogg') || type.includes('opus')) return 'ogg';
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'mp4';
  if (type.includes('webm')) return 'webm';
  if (type.includes('amr')) return 'amr';
  if (type.includes('flac')) return 'flac';
  return 'audio';
}

export async function transcribeAudio(buffer: Buffer, contentType: string): Promise<string | null> {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  if (!key) {
    console.warn('[speech] AZURE_SPEECH_KEY is not set; voice message left untranscribed');
    return null;
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
    console.warn(`[speech] audio of ${buffer.byteLength} bytes is outside the transcription window`);
    return null;
  }

  const endpoint = (process.env.AZURE_SPEECH_ENDPOINT?.trim() || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const locale = process.env.AZURE_SPEECH_LOCALE?.trim() || 'bn';
  const mime = contentType.split(';')[0].trim() || 'audio/mp4';
  const filename = `voice.${extensionFor(contentType)}`;

  // The enhanced model first only when asked for: it cannot read Meta's MP4 voice clips.
  const definitions: Array<Record<string, unknown>> = [];
  if (process.env.AZURE_SPEECH_ENHANCED === 'true') {
    definitions.push({
      locales: [locale],
      enhancedMode: {
        enabled: true,
        model: 'mai-transcribe-2',
        modelOptions: { timestamps: 'none', transcribeStyle: 'clean' },
      },
    });
  }
  // No locales: the latest multilingual model identifies Bangla, English and code-mixed speech
  // on its own, and is the only mode that accepts the clip format Facebook actually sends.
  definitions.push({});

  for (const definition of definitions) {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
    form.append('definition', JSON.stringify(definition));

    try {
      const res = await fetch(
        `${endpoint}/speechtotext/transcriptions:transcribe?api-version=${API_VERSION}`,
        {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': key },
          body: form,
          signal: AbortSignal.timeout(45_000),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(
          `[speech] transcription attempt failed (${res.status})${
            'enhancedMode' in definition ? ' [enhanced]' : ''
          }: ${detail.slice(0, 300)}`,
        );
        continue;
      }
      const data = (await res.json()) as {
        combinedPhrases?: Array<{ text?: string }>;
        phrases?: Array<{ text?: string }>;
      };
      const text = (data.combinedPhrases ?? data.phrases ?? [])
        .map((phrase) => phrase.text?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) return text;
      console.warn('[speech] transcription returned no text');
    } catch (err) {
      console.error('[speech] transcription request failed:', err);
    }
  }

  return null;
}
