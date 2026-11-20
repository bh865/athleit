// Request validation for the payment Edge Functions. Strict: unknown fields are rejected, so a client that
// sends an `amount`, `fee` or `destination` gets a 400, never a silently-ignored value.
import { z } from 'npm:zod@4.6.7';

const uuid = z.uuid();

/**
 * One of: whole requests (as before), installments of a plan already created (manual / early / the rest), or the start of
 * a plan (a request, a size and whether the family opts in to autopay). Never an amount.
 */
export const createPaymentIntentInput = z.union([
  z.object({ requestIds: z.array(uuid).min(1).max(25) }).strict(),
  z.object({ installmentIds: z.array(uuid).min(1).max(25) }).strict(),
  z
    .object({
      plan: z
        .object({ requestId: uuid, size: z.number().int().min(2).max(6), autopay: z.boolean() })
        .strict(),
    })
    .strict(),
]);
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentInput>;

/** Shown to the family next to the autopay choice; recorded with the consent so we can prove what they saw. */
export const AUTOPAY_CONSENT_VERSION = 'autopay-2026-11';

export const onboardingInput = z
  .object({
    teamId: uuid.optional(),
    clubId: uuid.optional(),
    platform: z.enum(['web', 'mobile']).default('web'),
    action: z.enum(['link', 'sync']).default('link'),
  })
  .strict()
  .refine((v) => Number(!!v.teamId) + Number(!!v.clubId) === 1, 'exactly one of teamId / clubId');

export const refundInput = z.union([
  z
    .object({
      paymentId: uuid,
      paymentItemId: uuid.optional(),
      baseCents: z.number().int().positive().max(5_000_000).optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .strict(),
  // A plan request: the refund is allocated to the latest paid installment first, then backwards.
  z
    .object({
      requestId: uuid,
      baseCents: z.number().int().positive().max(5_000_000).optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .strict(),
]);

export const exportInput = z.object({ eventId: uuid }).strict();

/** Billing: a team id (checkout, portal) or a team id and an action. Never a price, amount or redirect target. */
export const billingTeamInput = z.object({ teamId: uuid }).strict();
export const updateSubscriptionInput = z
  .object({ teamId: uuid, action: z.enum(['cancel', 'resume']) })
  .strict();
