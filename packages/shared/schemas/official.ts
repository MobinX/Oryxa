import { z } from '@hono/zod-openapi';
import { uuidSchema } from '@shared/schemas/base';

/**
 * Official Channels (spec §4): settings, tickets and onboarding prospects. These are the
 * wire contracts behind /api2/admin/official/*; the db crud mirrors the field lists.
 */

export const officialAvailability = z.enum(['available', 'taking_onboarding_requests']);
export type OfficialAvailability = z.infer<typeof officialAvailability>;

export const officialSettingsSchema = z.object({
  availability: officialAvailability.optional(),
  availabilityNote: z.string().max(2000).nullable().optional(),
  aiEnabled: z.boolean().optional(),
  autoReply: z.boolean().optional(),
  tone: z.string().max(40).nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
});
export type OfficialSettingsPatch = z.infer<typeof officialSettingsSchema>;

export const ticketStatus = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
export const ticketPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export const ticketType = z.enum(['support', 'security']);

export const ticketListQuerySchema = z.object({
  type: ticketType.optional(),
  status: ticketStatus.optional(),
  priority: ticketPriority.optional(),
  channelId: uuidSchema.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export const ticketPatchSchema = z.object({
  status: ticketStatus.optional(),
  priority: ticketPriority.optional(),
  assigneeUserId: uuidSchema.nullable().optional(),
  subject: z.string().max(500).nullable().optional(),
  summary: z.string().max(8000).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
});
export type TicketPatch = z.infer<typeof ticketPatchSchema>;

export const ticketNoteSchema = z.object({ note: z.string().min(1).max(4000) });

export const prospectStatus = z.enum([
  'new',
  'reviewing',
  'prioritized',
  'onboarding_requested',
  'onboarded',
  'rejected',
]);

export const prospectListQuerySchema = z.object({
  status: prospectStatus.optional(),
  channelId: uuidSchema.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ProspectListQuery = z.infer<typeof prospectListQuerySchema>;

export const prospectPatchSchema = z.object({
  status: prospectStatus.optional(),
  notes: z.string().max(8000).nullable().optional(),
});
export type ProspectPatch = z.infer<typeof prospectPatchSchema>;

/** Every weight 0–10; absent fields keep the crud layer's default. */
export const prospectWeightsSchema = z.object({
  name: z.number().int().min(0).max(10).optional(),
  country: z.number().int().min(0).max(10).optional(),
  businessType: z.number().int().min(0).max(10).optional(),
  employeesEstimate: z.number().int().min(0).max(10).optional(),
  budget: z.number().int().min(0).max(10).optional(),
  needs: z.number().int().min(0).max(10).optional(),
});
export type ProspectWeights = z.infer<typeof prospectWeightsSchema>;

export const officialReplySchema = z.object({
  content: z.string().min(1).max(4000),
  /** `paused: true` in the same breath is a takeover with a first human reply. */
  paused: z.boolean().optional(),
});

export const officialTakeoverSchema = z.object({ paused: z.boolean() });

export const officialConversationListQuerySchema = z.object({
  channelId: uuidSchema.optional(),
  platform: z.enum(['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter', 'tiktok']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type OfficialConversationListQuery = z.infer<typeof officialConversationListQuerySchema>;
