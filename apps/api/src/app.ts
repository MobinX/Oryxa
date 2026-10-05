import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { usersRouter } from '@api/routes/users';
import { businessesRouter } from '@api/routes/businesses';
import { storeRouter } from '@api/routes/store';
import { visitsRouter } from '@api/routes/visits';
import { productsRouter } from '@api/routes/products';
import { ordersRouter } from '@api/routes/orders';
import { channelsRouter, facebookCallbackRouter } from '@api/routes/channels';
import { conversationsRouter } from '@api/routes/conversations';
import { postsRouter } from '@api/routes/posts';
import { uploadsRouter } from '@api/routes/uploads';
import { tokenAnalyticsRouter } from '@api/routes/token-analytics';
import { plansRouter } from '@api/routes/plans';
import { billingRouter } from '@api/routes/billing';
import { logsRouter } from '@api/routes/logs';
import { adminRouter } from '@api/routes/admin';
import { adminPlansRouter } from '@api/routes/admin-plans';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { internalRouter } from '@api/routes/internal/run';
import { logRequest, handleError, handleNotFound } from '@api/lib/logmiddleware';
import { emit } from '@api/lib/log';
import { wireDatabaseLogging } from '@api/lib/db-log';
import { setIntegrationLogSink } from '@repo/integrations/http-log';

export const app = new OpenAPIHono();

// Outermost so every request gets a requestId and correlation context; it adds
// no request or response header.
app.use('*', logRequest);
app.onError(handleError);
app.notFound(handleNotFound);

// The Graph and B2 calls live in a leaf package that knows nothing about logging;
// this is the one place that connects it to the queue, so a token URL never
// reaches the ingest path.
setIntegrationLogSink((evt, fields) => emit(evt, fields));

// The db wrapper reports; what becomes a row is decided here, next to the rest of
// the log policy.
wireDatabaseLogging();

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
// Its own router so nothing is added inside the handlers the Flutter client
// already depends on; this is a new path, not a new branch in an old one.
app.route('/api/v1', visitsRouter);
// Same reason, and it has to be *before* the routers below: their
// `use('/:businessId/*')` matches a single-segment path too, so a price list mounted
// after them would answer 401 to the shoppers who have not signed up yet.
app.route('/api/v1', plansRouter);
// OAuth callback must register before /:businessId/* routers (otherwise "auth" matches as businessId)
app.route('/api/v1', facebookCallbackRouter);
app.route('/api/v1', productsRouter);
app.route('/api/v1', ordersRouter);
app.route('/api/v1', channelsRouter);
app.route('/api/v1', conversationsRouter);
app.route('/api/v1', postsRouter);
app.route('/api/v1', uploadsRouter);
app.route('/api/v1', tokenAnalyticsRouter);
// Registered last of the `/api/v1` routers so its own `/:businessId/*` auth
// middleware can never run on a route that shipped before it.
app.route('/api/v1', billingRouter);
// A prefix of its own so nothing is added inside /api/v1, which the Flutter
// client's generated contract lives on.
app.route('/api2', logsRouter);
app.route('/api2', adminRouter);
app.route('/api2', adminPlansRouter);
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
