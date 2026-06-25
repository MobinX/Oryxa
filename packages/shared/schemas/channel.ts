import { z } from '@hono/zod-openapi';
import { platformSchema, timestampSchema, uuidSchema } from './base';

export const createAgentInputSchema = z.object({
  name: z.string().min(1).max(255),
  systemPrompt: z.string().min(1),
  platformType: platformSchema,
});

export const selectAgentSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  platformType: platformSchema,
  systemPrompt: z.string().optional(),
  createdAt: timestampSchema.optional(),
});

export const createAgentOutputSchema = z.object({
  id: uuidSchema,
  createdAt: timestampSchema,
});

export const createChannelInputSchema = z.object({
  platform: platformSchema,
  apiToken: z.string().min(1),
  platformChannelId: z.string().min(1),
  agentId: uuidSchema.optional(),
  extraInfo: z.string().optional(),
});

export const createChannelOutputSchema = z.object({
  id: uuidSchema,
  status: z.literal('linked'),
});

export const updateChannelAgentSchema = z.object({
  agentId: uuidSchema.nullable(),
});
