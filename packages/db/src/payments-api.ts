import type { Client, Result } from './api';
import type { Database, Tables } from './database.types';

/**
 * Typed data access for Phase 4 (payments). Reads use RLS-protected tables or read functions; every write is a
 * database function or an Edge Function. NOTHING here supplies an amount: the server computes every charge.
 */
type Fn = Database['public']['Functions'];
export type ConnectedAccountStatus = Fn['connected_account_status']['Returns'][number];
export type CollectionSummary = Fn['event_collection_summary']['Returns'][number];
export type CollectionRow = Fn['event_collection_detail']['Returns'][number];
export type HouseholdPaymentRow = Fn['household_payments']['Returns'][number];
export type OpenPaymentRow = Fn['household_open_payments']['Returns'][number];
export type HouseholdReceiptRow = Fn['household_receipts']['Returns'][number];
export type PaymentEventRow = Pick<
  Tables<'payment_events'>,
  | 'id'
  | 'title'
  | 'description'
  | 'amount_cents'
  | 'due_at'
  | 'status'
  | 'fee_policy'
  | 'audience'
  | 'team_id'
  | 'club_id'
  | 'created_at'
>;
export type FeeConfigRow = Tables<'fee_config'>;

export interface Owner {
  teamId?: string | undefined;
  clubId?: string | undefined;
}

export interface QuoteLine {
  kind: 'item' | 'athleit_charge' | 'service_fee';
  label: string;
  amount_cents: number;
  request_id?: string;
  display_id?: string;
}
export interface CheckoutQuote {
  fee_policy: 'absorb' | 'pass_on';
  request_set_key: string;
  lines: QuoteLine[];
  base_cents: number;
  platform_fee_cents: number;
  processing_fee_cents: number;
  total_cents: number;
}

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(
  e: { message?: string; code?: string; details?: string | null } | null,
): Result<T> => ({
  data: null,
  error: { message: e?.message ?? 'Unknown error', code: e?.code, details: e?.details },
});
const NULL = null as unknown as string;

export async function getConnectedAccountStatus(
  c: Client,
  o: Owner,
): Promise<Result<ConnectedAccountStatus | null>> {
  const { data, error } = await c.rpc('connected_account_status', {
    p_team_id: o.teamId ?? NULL,
    p_club_id: o.clubId ?? NULL,
  });
  return error ? fail(error) : ok(data?.[0] ?? null);
}

export async function setDefaultFeePolicy(
  c: Client,
  o: Owner,
  policy: 'absorb' | 'pass_on',
): Promise<Result<null>> {
  const { error } = await c.rpc('set_default_fee_policy', {
    p_team_id: o.teamId ?? NULL,
    p_club_id: o.clubId ?? NULL,
    p_policy: policy,
  });
  return error ? fail(error) : ok(null);
}

export async function getActiveFeeConfig(c: Client): Promise<Result<FeeConfigRow>> {
  const { data, error } = await c.from('fee_config').select('*').eq('is_active', true).single();
  return error ? fail(error) : ok(data);
}

export async function listPaymentEvents(c: Client, o: Owner): Promise<Result<PaymentEventRow[]>> {
  const q = c
    .from('payment_events')
    .select(
      'id,title,description,amount_cents,due_at,status,fee_policy,audience,team_id,club_id,created_at',
    )
    .order('created_at', { ascending: false });
  const { data, error } = await (o.teamId
    ? q.eq('team_id', o.teamId)
    : q.eq('club_id', o.clubId ?? ''));
  return error ? fail(error) : ok(data);
}

export interface NewPaymentEvent extends Owner {
  title: string;
  description?: string | undefined;
  amountCents: number;
  dueAt: string;
  audience: 'all_active_roster' | 'selected_players';
  playerIds?: string[] | undefined;
  feePolicy?: 'absorb' | 'pass_on' | undefined;
}

export async function createPaymentEvent(c: Client, e: NewPaymentEvent): Promise<Result<string>> {
  const { data, error } = await c.rpc('create_payment_event', {
    p_team_id: e.teamId ?? NULL,
    p_club_id: e.clubId ?? NULL,
    p_title: e.title,
    p_description: e.description ?? NULL,
    p_amount_cents: e.amountCents,
    p_due_at: e.dueAt,
    p_audience: e.audience,
    p_audience_player_ids: (e.playerIds ?? null) as unknown as string[],
    p_fee_policy: e.feePolicy ?? NULL,
  });
  return error ? fail(error) : ok(data);
}

export async function publishPaymentEvent(c: Client, id: string): Promise<Result<number>> {
  const { data, error } = await c.rpc('publish_payment_event', { p_event_id: id });
  return error ? fail(error) : ok(data);
}
export async function cancelPaymentEvent(c: Client, id: string): Promise<Result<number>> {
  const { data, error } = await c.rpc('cancel_payment_event', { p_event_id: id });
  return error ? fail(error) : ok(data);
}
export async function sendPaymentReminders(c: Client, id: string): Promise<Result<number>> {
  const { data, error } = await c.rpc('send_payment_reminders', { p_event_id: id });
  return error ? fail(error) : ok(data);
}
export async function waiveRequest(
  c: Client,
  requestId: string,
  note?: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('waive_request', { p_request_id: requestId, p_note: note ?? NULL });
  return error ? fail(error) : ok(null);
}
export async function recordOfflinePayment(
  c: Client,
  requestId: string,
  method: 'cash' | 'check' | 'other',
  note?: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('record_offline_payment', {
    p_request_id: requestId,
    p_method: method,
    p_note: note ?? NULL,
  });
  return error ? fail(error) : ok(null);
}

export async function getCollectionSummary(
  c: Client,
  eventId: string,
): Promise<Result<CollectionSummary | null>> {
  const { data, error } = await c.rpc('event_collection_summary', { p_event_id: eventId });
  return error ? fail(error) : ok(data?.[0] ?? null);
}
export async function getCollectionDetail(
  c: Client,
  eventId: string,
): Promise<Result<CollectionRow[]>> {
  const { data, error } = await c.rpc('event_collection_detail', { p_event_id: eventId });
  return error ? fail(error) : ok(data ?? []);
}
export async function getHouseholdPayments(c: Client): Promise<Result<HouseholdPaymentRow[]>> {
  const { data, error } = await c.rpc('household_payments', { p_household_id: NULL });
  return error ? fail(error) : ok(data ?? []);
}
export async function getHouseholdReceipts(c: Client): Promise<Result<HouseholdReceiptRow[]>> {
  const { data, error } = await c.rpc('household_receipts', { p_household_id: NULL });
  return error ? fail(error) : ok(data ?? []);
}

/** The server-computed review sheet. Takes only request ids. */
export async function getCheckoutQuote(
  c: Client,
  requestIds: string[],
): Promise<Result<CheckoutQuote>> {
  const { data, error } = await c.rpc('payer_checkout_quote', { p_request_ids: requestIds });
  return error ? fail(error) : ok(data as unknown as CheckoutQuote);
}

// Edge Functions -----------------------------------------------------------------------------------------------
async function invoke<T>(
  c: Client,
  name: string,
  body: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await c.functions.invoke(name, { body });
  if (!error) return ok(data as T);
  // Non-2xx: the function answers {"error":"<code>"}; surface the code so friendlyError can map it.
  const ctx = (error as { context?: Response }).context;
  let code = error.message;
  try {
    const j = (await ctx?.json()) as { error?: string };
    if (j?.error) code = j.error;
  } catch {
    /* keep the generic message */
  }
  return fail({ message: code });
}

export interface PaymentIntentResult {
  paymentId: string;
  clientSecret: string | null;
  status: string;
  totalCents: number;
  /** The connected account the intent lives on: initialise Stripe.js / PaymentSheet with it. */
  stripeAccountId: string;
}
/** create-payment-intent accepts ONLY request ids. */
export const createPaymentIntent = (c: Client, requestIds: string[]) =>
  invoke<PaymentIntentResult>(c, 'create-payment-intent', { requestIds });
/** Start a plan of `size` installments for one request: the server creates the plan and charges installment 1. */
export const createPlanIntent = (
  c: Client,
  a: { requestId: string; size: number; autopay: boolean },
) => invoke<PaymentIntentResult>(c, 'create-payment-intent', { plan: a });
/** Pay installments of an existing plan (one, several, or the whole remaining balance). */
export const createInstallmentIntent = (c: Client, installmentIds: string[]) =>
  invoke<PaymentIntentResult>(c, 'create-payment-intent', { installmentIds });
export const startConnectOnboarding = (
  c: Client,
  o: Owner,
  platform: 'web' | 'mobile',
  action: 'link' | 'sync' = 'link',
) =>
  invoke<{ url?: string; onboardingStatus?: string }>(c, 'connect-onboarding', {
    ...(o.teamId ? { teamId: o.teamId } : { clubId: o.clubId }),
    platform,
    action,
  });
export const refundPayment = (
  c: Client,
  a:
    | { paymentId: string; paymentItemId?: string; baseCents?: number; reason?: string }
    | { requestId: string; baseCents?: number; reason?: string },
) =>
  invoke<{ refunds: { refundId: string; amountCents: number; status: string }[] }>(
    c,
    'refund-payment',
    a,
  );
export async function exportPaymentEvent(c: Client, eventId: string): Promise<Result<string>> {
  return invoke<string>(c, 'export-payments', { eventId });
}

/** Payments the family started but never put a card to. Nothing was charged; their requests show as processing. */
export async function getOpenPayments(c: Client): Promise<Result<OpenPaymentRow[]>> {
  const { data, error } = await c.rpc('household_open_payments');
  return error ? fail(error) : ok(data ?? []);
}
/** Walk away from an unfinished payment: it is canceled and its requests can be paid again. */
export async function cancelOpenPayment(c: Client, paymentId: string): Promise<Result<null>> {
  const { error } = await c.rpc('cancel_open_payment', { p_payment_id: paymentId });
  return error ? fail(error) : ok(null);
}

// Installment plans ---------------------------------------------------------------------------------------------
export type PlanCadence = 'weekly' | 'biweekly' | 'monthly';
export type InstallmentStatus =
  | 'scheduled'
  | 'due'
  | 'processing'
  | 'paid'
  | 'paid_offline'
  | 'failed'
  | 'waived'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';
export type InstallmentRow = Pick<
  Tables<'payment_request_installments'>,
  | 'id'
  | 'request_id'
  | 'sequence'
  | 'amount_cents'
  | 'due_at'
  | 'status'
  | 'attempt_count'
  | 'next_retry_at'
  | 'paid_at'
  | 'last_reminded_at'
> & { status: InstallmentStatus };

/** The server's answer for one plan size: schedule and fee impact (display only; the charge is computed again at checkout). */
export interface PlanQuoteSize {
  plan_size: number;
  cadence: PlanCadence;
  fee_policy: 'absorb' | 'pass_on';
  installments: {
    sequence: number;
    due_at: string;
    base_cents: number;
    platform_fee_cents: number;
    processing_fee_cents: number;
    total_cents: number;
  }[];
  total_cents: number;
  full_pay_total_cents: number;
  extra_cents: number;
  athleit_charge_cents: number;
  charge_now_cents: number;
}
export interface PlanQuote {
  sizes: number[];
  cadence: PlanCadence;
  current_plan?: number | null;
  plans: Record<string, PlanQuoteSize>;
}

export async function getPlanQuote(c: Client, requestId: string): Promise<Result<PlanQuote>> {
  const { data, error } = await c.rpc('payer_plan_quote', { p_request_id: requestId });
  return error ? fail(error) : ok(data as unknown as PlanQuote);
}
export async function getInstallmentQuote(
  c: Client,
  installmentIds: string[],
): Promise<Result<CheckoutQuote>> {
  const { data, error } = await c.rpc('payer_installment_quote', {
    p_installment_ids: installmentIds,
  });
  return error ? fail(error) : ok(data as unknown as CheckoutQuote);
}
export async function getRequestInstallments(
  c: Client,
  requestId: string,
): Promise<Result<InstallmentRow[]>> {
  const { data, error } = await c
    .from('payment_request_installments')
    .select(
      'id, request_id, sequence, amount_cents, due_at, status, attempt_count, next_retry_at, paid_at, last_reminded_at',
    )
    .eq('request_id', requestId)
    .order('sequence');
  return error ? fail(error) : ok((data ?? []) as InstallmentRow[]);
}
export async function setPlanAutopay(
  c: Client,
  requestId: string,
  autopay: boolean,
): Promise<Result<null>> {
  const { error } = await c.rpc('set_plan_autopay', {
    p_request_id: requestId,
    p_autopay: autopay,
  });
  return error ? fail(error) : ok(null);
}
/** Draft events only (the terms freeze at publish). */
export async function setPaymentEventPlan(
  c: Client,
  eventId: string,
  options: number[],
  cadence: PlanCadence,
): Promise<Result<null>> {
  const { error } = await c.rpc('set_payment_event_plan', {
    p_event_id: eventId,
    p_options: options,
    p_cadence: cadence,
  });
  return error ? fail(error) : ok(null);
}
export async function setRegistrationEventPlan(
  c: Client,
  eventId: string,
  options: number[],
  cadence: PlanCadence,
  requireFullBalance: 'none' | 'event_start' = 'none',
): Promise<Result<null>> {
  const { error } = await c.rpc('set_registration_event_plan', {
    p_event_id: eventId,
    p_options: options,
    p_cadence: cadence,
    p_require_full_balance: requireFullBalance,
  });
  return error ? fail(error) : ok(null);
}

// Staff operations on installments (issuer staff; the database checks).
export async function recordOfflineInstallment(
  c: Client,
  installmentId: string,
  method: 'cash' | 'check' | 'other',
  note?: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('record_offline_installment', {
    p_installment_id: installmentId,
    p_method: method,
    p_note: note ?? NULL,
  });
  return error ? fail(error) : ok(null);
}
export async function waiveInstallment(
  c: Client,
  installmentId: string,
  note?: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('waive_installment', {
    p_installment_id: installmentId,
    p_note: note ?? NULL,
  });
  return error ? fail(error) : ok(null);
}
export async function waiveRemainingBalance(
  c: Client,
  requestId: string,
  note?: string,
): Promise<Result<number>> {
  const { data, error } = await c.rpc('waive_remaining_balance', {
    p_request_id: requestId,
    p_note: note ?? NULL,
  });
  return error ? fail(error) : ok(data);
}
export async function retryInstallmentCharge(
  c: Client,
  installmentId: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('retry_installment_charge', { p_installment_id: installmentId });
  return error ? fail(error) : ok(null);
}
export async function sendInstallmentReminder(
  c: Client,
  installmentId: string,
): Promise<Result<boolean>> {
  const { data, error } = await c.rpc('send_installment_reminder', {
    p_installment_id: installmentId,
  });
  return error ? fail(error) : ok(data);
}
export async function restructurePlan(
  c: Client,
  requestId: string,
  remaining: number,
  nextDue: string,
  note?: string,
): Promise<Result<null>> {
  const { error } = await c.rpc('restructure_plan', {
    p_request_id: requestId,
    p_remaining: remaining,
    p_next_due: nextDue,
    p_note: note ?? NULL,
  });
  return error ? fail(error) : ok(null);
}
