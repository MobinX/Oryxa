import { z } from '@hono/zod-openapi';

/**
 * The wire form of the `since` filter on every read endpoint: an ISO-8601 instant,
 * matched inclusively against each row's last-change timestamp. Kept in the API
 * layer so a route never has to import the schema from the shared package twice.
 */
export const sinceSchema = z
  .preprocess((v) => (v === '' ? undefined : v), z.coerce.date().optional())
  .openapi({
    description: 'ISO-8601 timestamp: return rows last changed at or after this instant. Empty = no filter.',
    example: '2026-01-01T00:00:00.000Z',
  });
