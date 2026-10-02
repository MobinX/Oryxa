import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { usersRouter } from '@api/routes/users';
import { businessesRouter } from '@api/routes/businesses';
import { storeRouter } from '@api/routes/store';
import { productsRouter } from '@api/routes/products';
import { ordersRouter } from '@api/routes/orders';
import { channelsRouter, facebookCallbackRouter } from '@api/routes/channels';
import { conversationsRouter } from '@api/routes/conversations';
import { postsRouter } from '@api/routes/posts';
import { uploadsRouter } from '@api/routes/uploads';
import { tokenAnalyticsRouter } from '@api/routes/token-analytics';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { internalRouter } from '@api/routes/internal/run';

export const app = new OpenAPIHono();

app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

app.get('/', (c) => c.json({ name: 'Oryxa API', version: '1.0.0' }));

app.route('/api/v1/users', usersRouter);
app.route('/api/v1/businesses', businessesRouter);
app.route('/api/v1/store', storeRouter);
// OAuth callback must register before /:businessId/* routers (otherwise "auth" matches as businessId)
app.route('/api/v1', facebookCallbackRouter);
app.route('/api/v1', productsRouter);
app.route('/api/v1', ordersRouter);
app.route('/api/v1', channelsRouter);
app.route('/api/v1', conversationsRouter);
app.route('/api/v1', postsRouter);
app.route('/api/v1', uploadsRouter);
app.route('/api/v1', tokenAnalyticsRouter);
app.route('/webhooks', fbWebhookRouter);
app.route('/internal', internalRouter);

// app.doc() config accepts no `components` key, so security schemes must be
// registered on the registry or every `security: [{ bearerAuth: [] }]` route
// ships a dangling reference.
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'Oryxa API', version: '1.0.0' },
});

app.get('/ui', swaggerUI({ url: '/doc' }));
