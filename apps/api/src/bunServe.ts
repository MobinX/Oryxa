import { app } from './app';

const port = parseInt(process.env.API_PORT ?? '3001', 10);

const server = {
  port,
  fetch: app.fetch,
};

/** Default export for `bun --hot` so reload keeps API_PORT. */
export default server;

if (import.meta.main) {
  Bun.serve(server);
  console.log(`Oryxa API running on http://localhost:${port}`);
}
