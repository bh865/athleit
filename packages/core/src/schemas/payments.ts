import { z } from 'zod';

import {
  MAX_CHECKOUT_REQUESTS,
  MAX_PAYMENT_DESCRIPTION_LENGTH,
  MAX_PAYMENT_NOTE_LENGTH,
  MAX_PAYMENT_TITLE_LENGTH,
  OFFLINE_METHODS,
  PAYMENT_AUDIENCES,
} from '../payments';
import { MAX_REQUEST_CENTS, MIN_CHARGE_CENTS } from '../money';

const uuid = z.uuid();

/** Integer cents only: a float, string or out-of-range value never reaches the database. */
export const centsSchema = z.number().int().min(MIN_CHARGE_CENTS).max(MAX_REQUEST_CENTS);
export const feePolicySchema = z.enum(['absorb', 'pass_on']);

/** The issuing form. Exactly one of teamId / clubId. */
export const createPaymentEventSchema = z
  .object({
    teamId: uuid.optional(),
    clubId: uuid.optional(),
    title: z.string().trim().min(1, 'Add a title').max(MAX_PAYMENT_TITLE_LENGTH),
    description: z.string().trim().max(MAX_PAYMENT_DESCRIPTION_LENGTH).optional(),
    amountCents: centsSchema,
    dueAt: z.iso.datetime({ offset: true }),
    audience: z.enum(PAYMENT_AUDIENCES),
    playerIds: z.array(uuid).max(2000).optional(),
    feePolicy: feePolicySchema.optional(),
  })
  .refine(
    (v) => Number(Boolean(v.teamId)) + Number(Boolean(v.clubId)) === 1,
    'Choose a team or a club',
  )
  .refine(
    (v) =>
      v.audience === 'selected_players' ? (v.playerIds?.length ?? 0) > 0 : !v.playerIds?.length,
    'Choose at least one player',
  );
export type CreatePaymentEventInput = z.infer<typeof createPaymentEventSchema>;

/** create-payment-intent accepts ONLY request ids. Any other field is rejected, never ignored silently. */
export const createPaymentIntentSchema = z
  .object({ requestIds: z.array(uuid).min(1).max(MAX_CHECKOUT_REQUESTS) })
  .strict();
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const waiveRequestSchema = z.object({
  requestId: uuid,
  note: z.string().trim().max(MAX_PAYMENT_NOTE_LENGTH).optional(),
});

export const offlinePaymentSchema = z.object({
  requestId: uuid,
  method: z.enum(OFFLINE_METHODS),
  note: z.string().trim().max(MAX_PAYMENT_NOTE_LENGTH).optional(),
});

export const refundSchema = z.object({
  paymentId: uuid,
  paymentItemId: uuid.optional(),
  /** Omitted = refund the whole item (or whole payment). Integer cents. */
  amountCents: z
    .number()
    .int()
    .positive()
    .max(MAX_REQUEST_CENTS * MAX_CHECKOUT_REQUESTS)
    .optional(),
  reason: z.string().trim().max(MAX_PAYMENT_NOTE_LENGTH).optional(),
});

/** The shape returned by public.payer_checkout_quote (snake_case from the database). */
export const checkoutQuoteSchema = z.object({
  currency: z.literal('usd'),
  fee_policy: feePolicySchema,
  connected_account_id: uuid,
  household_id: uuid,
  request_set_key: z.string(),
  lines: z.array(
    z.object({
      kind: z.enum(['item', 'athleit_charge', 'service_fee']),
      label: z.string(),
      amount_cents: z.number().int().nonnegative(),
      request_id: uuid.optional(),
      display_id: z.string().optional(),
    }),
  ),
  items: z.array(
    z.object({
      request_id: uuid,
      amount_cents: z.number().int().positive(),
      platform_fee_cents: z.number().int().nonnegative(),
      processing_fee_passthrough_cents: z.number().int().nonnegative(),
    }),
  ),
  base_cents: z.number().int().positive(),
  platform_fee_cents: z.number().int().nonnegative(),
  processing_fee_cents: z.number().int().nonnegative(),
  total_cents: z.number().int().positive(),
  estimated_stripe_fee_cents: z.number().int().nonnegative(),
  estimated_net_cents: z.number().int(),
});
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;
