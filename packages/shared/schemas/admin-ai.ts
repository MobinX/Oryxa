import { z } from '@hono/zod-openapi';
import { platformSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

/** The statuses of the leads pipeline (spec D), kept closed like every other enum here. */
export const leadStatusSchema = z.enum([
  'new',
  'qualified',
  'awaiting_information',
  'waitlisted',
  'contact_requested',
  'contacted',
  'converted',
  'closed',
]);

export const waitlistModeSchema = z.enum(['off', 'auto', 'manual']);

/** Per-channel AI toggles (spec B). Absent fields leave the stored value alone. */
export const channelAiConfigSchema = z.object({
  channelId: uuidSchema,
  aiEnabled: z.boolean().optional(),
  aiCommentsEnabled: z.boolean().optional(),
  privateRepliesEnabled: z.boolean().optional(),
  autoReply: z.boolean().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  maxReplyLength: z.number().int().min(1).max(10000).optional(),
  tone: z.string().max(40).optional(),
  language: z.string().max(20).optional(),
  perChannelInstructions: z.string().max(20000).nullable().optional(),
  leadQuestions: z.array(z.string().max(2000)).max(20).optional(),
  escalationRules: z.record(z.unknown()).optional(),
  commentBehavior: z.record(z.unknown()).optional(),
});

const commentBehaviorAction = z.enum(['ignore', 'reply_public', 'reply_private', 'move_private', 'escalate']);

export const commentBehaviorSchema = z.object({
  /**
   * What a customer comment of each kind may do, so a confused comment can be set to
   * clarify and a complaint to escalate exactly as the spec words it.
   */
  productQuestion: commentBehaviorAction.optional(),
  pricing: commentBehaviorAction.optional(),
  interested: commentBehaviorAction.optional(),
  spam: z.enum(['ignore', 'flag']).optional(),
  complaint: z.enum(['ignore', 'escalate', 'reply_public']).optional(),
  unclear: z.enum(['ignore', 'clarify', 'reply_public']).optional(),
});

export const businessProfileSchema = z.object({
  displayName: z.string().max(120).optional(),
  description: z.string().max(20000).nullable().optional(),
  productsServices: z.string().max(20000).nullable().optional(),
  audience: z.string().max(20000).nullable().optional(),
  serviceAreas: z.string().max(20000).nullable().optional(),
  pricingPackages: z.string().max(20000).nullable().optional(),
  hoursHolidays: z.string().max(20000).nullable().optional(),
  contacts: z.string().max(20000).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  socials: z.string().max(20000).nullable().optional(),
  limitations: z.string().max(20000).nullable().optional(),
  policies: z.string().max(20000).nullable().optional(),
});

export const knowledgeEntrySchema = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(20000),
  tags: z.array(z.string().max(60)).max(20).optional(),
  active: z.boolean().optional(),
});

export const capacitySchema = z.object({
  businessId: uuidSchema,
  acceptingNewCustomers: z.boolean().optional(),
  maxCapacity: z.number().int().min(0).max(1_000_000).optional(),
  availableCapacity: z.number().int().min(0).max(1_000_000).optional(),
  waitlistMode: waitlistModeSchema.optional(),
  fullCapacityMessage: z.string().max(20000).nullable().optional(),
  followUpInfo: z.string().max(20000).nullable().optional(),
  preferredContact: z.string().max(40).nullable().optional(),
  etaText: z.string().max(200).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
});

export const createLeadSchema = z.object({
  businessId: uuidSchema.optional(),
  channelId: uuidSchema,
  platform: platformSchema,
  platformUserId: z.string().min(1).max(255),
  conversationId: uuidSchema.nullable().optional(),
  name: z.string().max(255).nullable().optional(),
  businessName: z.string().max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  contactMethod: z.string().max(20).nullable().optional(),
  requirements: z.string().max(20000).nullable().optional(),
  interest: z.string().max(20000).nullable().optional(),
  timeframe: z.string().max(100).nullable().optional(),
  sourceChannel: z.string().max(30).nullable().optional(),
  status: leadStatusSchema.optional(),
  notes: z.string().max(20000).nullable().optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().max(255).nullable().optional(),
  businessName: z.string().max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  contactMethod: z.string().max(20).nullable().optional(),
  requirements: z.string().max(20000).nullable().optional(),
  interest: z.string().max(20000).nullable().optional(),
  timeframe: z.string().max(100).nullable().optional(),
  status: leadStatusSchema.optional(),
  assigneeUserId: uuidSchema.nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  consent: z.boolean().optional(),
});

/** A lead row as the console reads it — the same fields the audit trail can replay. */
export const leadSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  platform: z.string(),
  platformUserId: z.string(),
  name: z.string().nullable(),
  businessName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: leadStatusSchema,
  consent: z.boolean(),
  notes: z.string().nullable(),
  assigneeUserId: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const leadEventSchema = z.object({
  id: uuidSchema,
  actorKind: z.string(),
  actorUserId: z.string().nullable(),
  kind: z.string(),
  data: z.record(z.unknown()),
  createdAt: timestampSchema,
});
