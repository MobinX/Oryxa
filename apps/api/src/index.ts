import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { usersRouter } from './routes/users';
import { businessesRouter } from './routes/businesses';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { channelsRouter, facebookCallbackRouter } from './routes/channels';
import { conversationsRouter } from './routes/conversations';
import { fbWebhookRouter } from './webhooks/facebook';
import { internalRouter } from './routes/internal/run';

const app = new OpenAPIHono();

app.use(
  '*',
  cors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    allowHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

app.get('/', (c) => c.json({ name: 'Oryxa API', version: '1.0.0' }));

app.route('/api/v1/users', usersRouter);
app.route('/api/v1/businesses', businessesRouter);
app.route('/api/v1', productsRouter);
app.route('/api/v1', ordersRouter);
app.route('/api/v1', channelsRouter);
app.route('/api/v1', conversationsRouter);
app.route('/api/v1', facebookCallbackRouter);
app.route('/webhooks', fbWebhookRouter);
app.route('/internal', internalRouter);

app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'Oryxa API', version: '1.0.0' },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
});

app.get('/ui', swaggerUI({ url: '/doc' }));

export default app;

const port = parseInt(process.env.API_PORT ?? '3001', 10);

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Oryxa API running on http://localhost:${port}`);
}
