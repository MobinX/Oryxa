import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Operator probe for the voice pipeline: is the transcoder binary actually present in this
 * deployment? A missing ffmpeg is the one failure that degrades quietly (voice falls back to the
 * multilingual model), so it needs a way to be answered without waiting for a customer to speak.
 */
export const audioCheckRouter = new Hono();

const require = createRequire(import.meta.url);

audioCheckRouter.get('/audio-check', (c) => {
  if (c.req.header('x-internal-key') !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  let ffmpegPath: string | null = null;
  let resolutionError: string | null = null;
  try {
    ffmpegPath = (require('ffmpeg-static') as string | null) ?? null;
  } catch (err) {
    resolutionError = err instanceof Error ? err.message : String(err);
  }

  return c.json({
    ffmpegPath,
    resolved: Boolean(ffmpegPath),
    exists: ffmpegPath ? existsSync(ffmpegPath) : false,
    resolutionError,
  });
});
