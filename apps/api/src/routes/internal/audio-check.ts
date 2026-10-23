import { Hono } from 'hono';
import { resolveFfmpegPath, transcribeAudio } from '@repo/integrations/azure-speech';
import { internalAuthMiddleware } from '@api/middleware/internal-auth';

/**
 * Operator probe for the voice pipeline. A missing ffmpeg is the one failure that degrades
 * quietly (voice falls back to the multilingual model), so it must be answerable without
 * waiting for a customer to speak. `?resolve=1` stages the binary; the POST transcribes a
 * supplied clip end to end.
 */
export const audioCheckRouter = new Hono();

audioCheckRouter.use('*', internalAuthMiddleware);

audioCheckRouter.get('/audio-check', async (c) => {
  const resolved = await resolveFfmpegPath(c.req.query('resolve') === '1');
  return c.json({ ok: Boolean(resolved) });
});

audioCheckRouter.post('/audio-check', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    audioBase64?: unknown;
    contentType?: unknown;
  } | null;
  if (typeof body?.audioBase64 !== 'string' || body.audioBase64.length > 4_000_000) {
    return c.json({ error: 'audioBase64 is required and must stay under ~4MB' }, 400);
  }
  const buffer = Buffer.from(body.audioBase64, 'base64');
  if (buffer.byteLength === 0) return c.json({ error: 'audio is empty' }, 400);

  const contentType = typeof body.contentType === 'string' ? body.contentType : 'audio/mp4';
  const started = Date.now();
  const transcript = await transcribeAudio(buffer, contentType);
  return c.json({ transcript, contentType, ms: Date.now() - started });
});
