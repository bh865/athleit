import { z } from 'zod';

import { MAX_DISPLAY_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(MAX_DISPLAY_NAME_LENGTH, `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters`);

export const signInSchema = z.object({
  email: emailSchema,
  // Don't enforce the sign-up password policy on sign-in; just require something.
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;
