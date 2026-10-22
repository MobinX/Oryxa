import { app } from './app';

const port = parseInt(process.env.API_PORT ?? '3001', 10);

const server = {
  port,
  fetch: app.fetch,
};

/** Default export for `bun --hot` so reload keeps API_PORT. */
export default server;

// Bun auto-serves the default export when this file is the entrypoint; calling Bun.serve here
// as well bound the port twice (EADDRINUSE) outside --hot.
if (import.meta.main) {
  console.log(`Oryxa API running on http://localhost:${port}`);
}
