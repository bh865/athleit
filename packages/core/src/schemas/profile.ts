import { z } from 'zod';

import { displayNameSchema } from './auth';

export const profileSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProfileRecord = z.infer<typeof profileSchema>;

/** Fields a user may change on their own profile (mirrors the column-level UPDATE grant). */
export const updateProfileSchema = z.object({
  display_name: displayNameSchema.optional(),
  avatar_url: z.url().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
