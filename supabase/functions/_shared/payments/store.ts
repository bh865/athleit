// The database side of the payment functions: a narrow interface (so the flows are unit-testable) and its
// implementation over a Supabase service-role client. Every call is an RPC to an idempotent svc_* function
// (or a plain row read/insert); no SQL strings, no amounts computed here.
export interface Rpc {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: any; error: { message?: string; code?: string } | null }>;
}

export interface Owner {
  teamId?: string;
  clubId?: string;
}

export interface Store {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  reservePayment(userId: string, requestIds: string[]): Promise<ReserveResult>;
  attachPaymentIntent(paymentId: string, pi: string): Promise<void>;
  releasePayment(paymentId: string): Promise<void>;
  paymentSucceeded(a: {
    pi: string;
    paymentId?: string;
    charge?: string;
    stripeFee?: number | null;
    amount?: number;
    currency?: string;
    destination?: string;
    applicationFee?: number | null;
  }): Promise<string>;
  paymentStatus(a: {
    pi: string;
    status: 'processing' | 'failed' | 'canceled';
    paymentId?: string;
  }): Promise<string>;
  refundEvent(a: {
    pi: string;
    refunds: { id: string; amount: number; status: string; ref?: string }[];
    paymentId?: string;
    charge?: string;
  }): Promise<string>;
  disputeEvent(a: {
    pi: string;
    disputeId: string;
    phase: 'created' | 'closed';
    outcome?: string;
    paymentId?: string;
  }): Promise<string>;
  setAccountStatus(a: {
    stripeAccountId: string;
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements: unknown;
    deauthorized?: boolean;
  }): Promise<string>;
  ledgerEvent(a: {
    eventId: string;
    type: string;
    livemode: boolean;
    account: string | null;
    payload: Record<string, unknown>;
  }): Promise<'new' | 'retry' | 'duplicate'>;
  finishEvent(eventId: string, error?: string | null, final?: boolean): Promise<void>;
  attachRefund(refundId: string, stripeRefundId: string, status: string): Promise<void>;
  failRefund(refundId: string): Promise<void>;
  reconcileCandidates(): Promise<Candidates>;
  cleanupRateLimits(): Promise<void>;
  getConnectedAccount(o: Owner): Promise<{ stripeAccountId: string } | null>;
  insertConnectedAccount(o: Owner, stripeAccountId: string, createdBy: string): Promise<void>;
}

export interface ReserveResult {
  reused: boolean;
  payment_id: string;
  stripe_payment_intent_id: string | null;
  status: string;
  total_cents: number;
  application_fee_cents?: number;
  description?: string;
  display_ids?: string[];
  request_set_key?: string;
  stripe_account_id: string;
}

export interface Candidates {
  open_payments: { id: string; pi: string; acct: string; status: string; abandoned: boolean }[];
  canceled_payments: { id: string; pi: string; acct: string }[];
  missing_fee: { id: string; pi: string; acct: string }[];
  accounts: string[];
  stuck_events: { id: string; account: string | null }[];
}

function check<T>(r: { data: T; error: { message?: string; code?: string } | null }): T {
  if (r.error) throw new Error(r.error.message ?? r.error.code ?? 'db_error');
  return r.data;
}

/** Service-role store. `db` is a supabase-js client created with the service-role key. */
export function supabaseStore(db: Rpc & { from(table: string): any }): Store {
  const call = async (n: string, a: Record<string, unknown> = {}) => check(await db.rpc(n, a));
  return {
    rateLimit: (b, l, w) =>
      call('svc_rate_limit', { p_bucket: b, p_limit: l, p_window_seconds: w }),
    reservePayment: (u, ids) => call('svc_reserve_payment', { p_uid: u, p_request_ids: ids }),
    attachPaymentIntent: async (id, pi) =>
      void (await call('svc_attach_payment_intent', { p_payment_id: id, p_pi: pi })),
    releasePayment: async (id) => void (await call('svc_release_payment', { p_payment_id: id })),
    paymentSucceeded: (a) =>
      call('svc_payment_succeeded', {
        p_pi: a.pi,
        p_payment_id: a.paymentId ?? null,
        p_charge: a.charge ?? null,
        p_stripe_fee: a.stripeFee ?? null,
        p_amount: a.amount ?? null,
        p_currency: a.currency ?? null,
        p_destination: a.destination ?? null,
        p_application_fee: a.applicationFee ?? null,
      }),
    paymentStatus: (a) =>
      call('svc_payment_status', {
        p_pi: a.pi,
        p_status: a.status,
        p_payment_id: a.paymentId ?? null,
      }),
    refundEvent: (a) =>
      call('svc_refund_event', {
        p_pi: a.pi,
        p_refunds: a.refunds,
        p_payment_id: a.paymentId ?? null,
        p_charge: a.charge ?? null,
      }),
    disputeEvent: (a) =>
      call('svc_dispute_event', {
        p_pi: a.pi,
        p_dispute_id: a.disputeId,
        p_phase: a.phase,
        p_outcome: a.outcome ?? null,
        p_payment_id: a.paymentId ?? null,
      }),
    setAccountStatus: (a) =>
      call('svc_set_account_status', {
        p_stripe_account_id: a.stripeAccountId,
        p_details_submitted: a.detailsSubmitted,
        p_charges_enabled: a.chargesEnabled,
        p_payouts_enabled: a.payoutsEnabled,
        p_requirements: a.requirements ?? {},
        p_deauthorized: a.deauthorized ?? false,
      }),
    ledgerEvent: (a) =>
      call('svc_ledger_event', {
        p_event_id: a.eventId,
        p_type: a.type,
        p_livemode: a.livemode,
        p_account: a.account,
        p_payload: a.payload,
      }),
    finishEvent: async (id, error = null, final = false) =>
      void (await call('svc_finish_event', { p_event_id: id, p_error: error, p_final: final })),
    attachRefund: async (id, sid, status) =>
      void (await call('svc_attach_refund', {
        p_refund_id: id,
        p_stripe_refund_id: sid,
        p_status: status,
      })),
    failRefund: async (id) => void (await call('svc_fail_refund', { p_refund_id: id })),
    reconcileCandidates: () => call('svc_reconcile_candidates'),
    cleanupRateLimits: async () => void (await call('svc_cleanup_rate_limits')),
    async getConnectedAccount(o) {
      const q = db.from('connected_accounts').select('stripe_account_id');
      const r = await (
        o.teamId ? q.eq('team_id', o.teamId) : q.eq('club_id', o.clubId)
      ).maybeSingle();
      if (r.error) throw new Error(r.error.message ?? 'db_error');
      return r.data ? { stripeAccountId: r.data.stripe_account_id } : null;
    },
    async insertConnectedAccount(o, sid, createdBy) {
      const r = await db.from('connected_accounts').insert({
        team_id: o.teamId ?? null,
        club_id: o.clubId ?? null,
        stripe_account_id: sid,
        created_by: createdBy,
      });
      if (r.error) throw new Error(r.error.message ?? 'db_error');
    },
  };
}
