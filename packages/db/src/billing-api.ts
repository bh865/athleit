import type { Client, Result } from './api';
import type { Database } from './database.types';

/**
 * Typed data access for team subscriptions. Reads are database functions that decide who sees what (admins everything,
 * coaches and managers status only); every write that touches Stripe is an Edge Function. NOTHING here supplies a price,
 * a redirect URL or a Stripe id: the server owns all of them.
 */
type Fn = Database['public']['Functions'];
export type BillingInvoiceRow = Fn['get_team_billing_invoices']['Returns'][number];

/** Structurally the same as BillingTerms / TeamBillingView in @athleit/core (this package does not depend on core). */
export interface BillingTermsRow {
  enabled: boolean;
  price_cents: number;
  currency: string;
  interval: string;
  trial_days: number;
  grace_days: number;
  trial_reminder_days: number[];
}
export interface TeamBillingRow {
  state:
    | 'off'
    | 'trialing'
    | 'active'
    | 'cancel_scheduled'
    | 'past_due'
    | 'trial_expired'
    | 'lapsed'
    | 'comped';
  access: 'full' | 'grace' | 'restricted';
  can_manage: boolean;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  grace_ends_at?: string | null;
  comp_until?: string | null;
  has_subscription?: boolean;
  price_cents?: number;
  price_mismatch?: boolean;
}

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(
  e: { message?: string; code?: string; details?: string | null } | null,
): Result<T> => ({
  data: null,
  error: { message: e?.message ?? 'Unknown error', code: e?.code, details: e?.details },
});

/** Pricing terms for copy ("14-day free trial, then $10/month"). Never hard-code them. */
export async function getBillingTerms(c: Client): Promise<Result<BillingTermsRow | null>> {
  const { data, error } = await c.rpc('get_billing_terms');
  return error ? fail(error) : ok((data ?? null) as unknown as BillingTermsRow | null);
}

/** Null when the caller is not staff of the team; `state: 'off'` while billing is disabled. */
export async function getTeamBilling(
  c: Client,
  teamId: string,
): Promise<Result<TeamBillingRow | null>> {
  const { data, error } = await c.rpc('get_team_billing', { p_team_id: teamId });
  return error ? fail(error) : ok((data ?? null) as unknown as TeamBillingRow | null);
}

/** Admins only (everyone else gets an empty list). */
export async function getTeamBillingInvoices(
  c: Client,
  teamId: string,
): Promise<Result<BillingInvoiceRow[]>> {
  const { data, error } = await c.rpc('get_team_billing_invoices', { p_team_id: teamId });
  return error ? fail(error) : ok(data ?? []);
}

/** The caller's own platform-admin role, or null. */
export async function getPlatformAdminRole(c: Client): Promise<Result<string | null>> {
  const { data, error } = await c.rpc('platform_admin_role');
  return error ? fail(error) : ok(data ?? null);
}

// Edge Functions ---------------------------------------------------------------------------------------------------
async function invoke<T>(
  c: Client,
  name: string,
  body: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await c.functions.invoke(name, { body });
  if (!error) return ok(data as T);
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

export interface BillingCheckoutResult {
  /** Stripe-hosted Checkout. Open it in the browser; the redirect back never grants anything. */
  url: string;
  trialExtendedToMinimum: boolean;
  trialEndsAt: string | null;
}
export const startBillingCheckout = (c: Client, teamId: string) =>
  invoke<BillingCheckoutResult>(c, 'create-billing-checkout', { teamId });
export const openBillingPortal = (c: Client, teamId: string) =>
  invoke<{ url: string }>(c, 'create-billing-portal-session', { teamId });
export const updateTeamSubscription = (c: Client, teamId: string, action: 'cancel' | 'resume') =>
  invoke<{ state: string; currentPeriodEnd: string | null }>(c, 'update-team-subscription', {
    teamId,
    action,
  });

export interface BillingCard {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}
/** Card brand and last four, fetched from Stripe on demand (never stored). Admins only. */
export const getBillingCard = (c: Client, teamId: string) =>
  invoke<BillingCard | null>(c, 'get-billing-card', { teamId });
