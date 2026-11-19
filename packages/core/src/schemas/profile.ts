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
  // An https picture URL or a path in the avatars bucket (`<user id>/<file>`); the database checks the owner.
  avatar_url: z
    .string()
    .max(500)
    .regex(/^(https:\/\/|[0-9a-f-]{36}\/)/i)
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
