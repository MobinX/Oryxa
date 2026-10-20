import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { ffmpegCandidates } from '@repo/integrations/azure-speech';

/**
 * Operator probe for the voice pipeline: is the transcoder binary actually present in this
 * deployment? A missing ffmpeg is the one failure that degrades quietly (voice falls back to the
 * multilingual model), so it needs a way to be answered without waiting for a customer to speak.
 */
export const audioCheckRouter = new Hono();

audioCheckRouter.get('/audio-check', (c) => {
  if (c.req.header('x-internal-key') !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  const candidates = ffmpegCandidates().map((candidate) => ({
    candidate,
    exists: existsSync(candidate),
  }));

  return c.json({
    cwd: process.cwd(),
    found: candidates.find((entry) => entry.exists)?.candidate ?? null,
    candidates,
  });
});
