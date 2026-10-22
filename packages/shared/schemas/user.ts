import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';

export const syncUserInputSchema = z.object({
  firebaseUid: z.string().min(1),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  signInMethod: z.string().min(1).max(50),
}).openapi('SyncUserInput');

/** The sync route after authentication: identity comes from the verified token, never the body. */
export const syncAuthenticatedUserInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  signInMethod: z.string().min(1).max(50).optional(),
}).openapi('SyncAuthenticatedUserInput');

export const updateUserInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  gender: z.string().max(20).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
}).openapi('UpdateUserInput');

export const deleteUserOutputSchema = z.object({ deleted: z.boolean() });

export const selectUserSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  firebaseUid: z.string(),
  signInMethod: z.string(),
  createdAt: timestampSchema,
}).openapi('User');

export const userMeOutputSchema = selectUserSchema.pick({
  id: true,
  name: true,
  email: true,
  phone: true,
});
