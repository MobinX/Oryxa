import { handle } from 'hono/vercel';
import { app } from './app';

export { app };

/** Default export: Vercel serverless handler (also used by `api/index.ts`). */
export default handle(app);
