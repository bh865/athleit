// Request validation for the payment Edge Functions. Strict: unknown fields are rejected, so a client that
// sends an `amount`, `fee` or `destination` gets a 400, never a silently-ignored value.
import { z } from 'npm:zod@4.6.7';

const uuid = z.uuid();

export const createPaymentIntentInput = z
  .object({ requestIds: z.array(uuid).min(1).max(25) })
  .strict();

export const onboardingInput = z
  .object({
    teamId: uuid.optional(),
    clubId: uuid.optional(),
    platform: z.enum(['web', 'mobile']).default('web'),
    action: z.enum(['link', 'sync']).default('link'),
  })
  .strict()
  .refine((v) => Number(!!v.teamId) + Number(!!v.clubId) === 1, 'exactly one of teamId / clubId');

export const refundInput = z
  .object({
    paymentId: uuid,
    paymentItemId: uuid.optional(),
    baseCents: z.number().int().positive().max(5_000_000).optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const exportInput = z.object({ eventId: uuid }).strict();
