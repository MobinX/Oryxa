import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

/**
 * Voice messages become text through Azure's fast transcription API.
 *
 * Meta sends voice notes as MP4/AAC. Azure's enhanced model (mai-transcribe-2) refuses that
 * container outright ("Format not recognised") but reads OGG/WAV/MP3/FLAC happily, and its
 * Bangla transcript is script-accurate where the standard multilingual model writes Banglish.
 * So the audio is converted with the bundled ffmpeg, sent through enhanced mode, and on any
 * conversion or service failure the original bytes go to the standard multilingual call —
 * voice transcription never silently dies.
 *
 * The caller gets the transcript or null; a failed transcription never blocks the webhook.
 */

const DEFAULT_ENDPOINT = 'https://oryxa.cognitiveservices.azure.com';
const API_VERSION = '2025-10-15';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Where the binary actually is. The packaged path is wrong once a bundler rewrites `__dirname`
 * (Vercel's build did exactly that), so the traced locations are checked directly; in local
 * development the package's own path answers first.
 */
export function ffmpegCandidates(): string[] {
  const cwd = process.cwd();
  const candidates = new Set<string>();
  if (ffmpegStatic) candidates.add(ffmpegStatic);
  for (const base of [cwd, join(cwd, 'apps/api'), join(cwd, 'apps/api2'), join(cwd, '../api'), join(cwd, '../../')]) {
    candidates.add(join(base, 'node_modules/ffmpeg-static/ffmpeg'));
  }
  return [...candidates];
}

function ffmpegBinary(): string | null {
  for (const candidate of ffmpegCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Formats the enhanced model accepts as-is; anything else is transcoded to OGG/Opus first. */
const ENHANCED_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/x-flac',
]);

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

async function transcodeForEnhanced(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (ENHANCED_TYPES.has(contentType)) return { buffer, contentType };

  const binary = ffmpegBinary();
  if (!binary) return null;

  const dir = await mkdtemp(join(tmpdir(), 'oryxa-audio-'));
  const input = join(dir, `voice.${extensionFor(contentType)}`);
  const output = join(dir, 'voice.ogg');

  try {
    await writeFile(input, buffer);
    await new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        ['-y', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', output],
        { timeout: 15_000 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    const converted = await readFile(output);
    return converted.byteLength > 0
      ? { buffer: converted, contentType: 'audio/ogg' }
      : null;
  } catch (err) {
    console.warn(
      '[speech] could not transcode the voice note for enhanced mode:',
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function requestTranscription(
  endpoint: string,
  key: string,
  audio: { buffer: Buffer; contentType: string },
  definition: Record<string, unknown>,
): Promise<string | null> {
  const mime = audio.contentType.split(';')[0].trim() || 'audio/mp4';
  const form = new FormData();
  form.append(
    'audio',
    new Blob([new Uint8Array(audio.buffer)], { type: mime }),
    `voice.${extensionFor(mime)}`,
  );
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
      return null;
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
    return text || null;
  } catch (err) {
    console.error('[speech] transcription request failed:', err);
    return null;
  }
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
  const enhancedEnabled = process.env.AZURE_SPEECH_ENHANCED !== 'false';
  const mime = contentType.split(';')[0].trim() || 'audio/mp4';

  if (enhancedEnabled) {
    const prepared = await transcodeForEnhanced(buffer, mime);
    if (prepared) {
      const text = await requestTranscription(endpoint, key, prepared, {
        locales: [locale],
        enhancedMode: {
          enabled: true,
          model: 'mai-transcribe-2',
          modelOptions: { timestamps: 'none', transcribeStyle: 'clean' },
        },
      });
      if (text) return text;
    }
  }

  // No locales: the multilingual model identifies Bangla, English and code-mixed speech on its
  // own, and accepts the clip exactly as Facebook sent it.
  return requestTranscription(endpoint, key, { buffer, contentType: mime }, {});
}
