import { handle } from 'hono/vercel';
import { app } from '../src/index';

/** Vercel serverless entry — local dev still uses `bun run dev` (Bun.serve). */
export default handle(app);
