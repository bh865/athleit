import { z } from 'zod';

import type { Client, Result } from './api';

/**
 * Typed access to the platform-admin functions (the /admin portal). Every function here is a database
 * function that checks the caller's platform role, and for writes an MFA (aal2) session, so nothing in this
 * file decides permissions. Returned JSON is validated with Zod: a shape change fails loudly in one place.
 * Never call these with a service-role client from the browser.
 */

// Errors ---------------------------------------------------------------------------------------------------------
export const ADMIN_ERROR_CODES = [
  'mfa_required',
  'not_authorized',
  'not_authenticated',
  'reason_required',
  'unknown_setting',
  'invalid_setting_value',
  'setting_out_of_range',
  'last_owner',
  'user_not_found',
  'already_admin',
  'already_enabled',
  'already_disabled',
  'report_not_open',
  'query_too_short',
  'invalid_range',
  'invalid_bucket',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number] | 'unknown';

/** Map a Postgres error to the portal's typed error code (the exception text is the code). */
export function adminErrorCode(
  e: { message?: string | undefined } | null | undefined,
): AdminErrorCode {
  const m = e?.message ?? '';
  return ADMIN_ERROR_CODES.find((c) => m.includes(c)) ?? 'unknown';
}

// Plumbing --------------------------------------------------------------------------------------------------------
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string; details?: string | null } | null;
  }>;
};

const fail = <T>(
  e: { message?: string; code?: string; details?: string | null } | null,
): Result<T> => ({
  data: null,
  error: { message: e?.message ?? 'Unknown error', code: e?.code, details: e?.details },
});

async function call<S extends z.ZodType>(
  c: Client,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<Result<z.infer<S>>> {
  const { data, error } = await (c as unknown as RpcClient).rpc(fn, args);
  if (error) return fail(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return fail({
      message: `Unexpected response from ${fn}: ${parsed.error.message}`,
      code: 'bad_shape',
    });
  }
  return { data: parsed.data, error: null };
}

async function callVoid(
  c: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<Result<null>> {
  const { error } = await (c as unknown as RpcClient).rpc(fn, args);
  return error ? fail(error) : { data: null, error: null };
}

// Schemas -------------------------------------------------------------------------------------------------------------
const iso = z.string();
const cursor = z.record(z.string(), z.unknown()).nullable();
const page = <T extends z.ZodType>(item: T) =>
  z.object({ as_of: iso, items: z.array(item), next_cursor: cursor.optional() });
const series = z.array(
  z.object({ at: iso, n: z.number().optional(), cents: z.number().optional() }),
);

export const PlatformRole = z.enum(['owner', 'admin', 'support']);
export type PlatformRole = z.infer<typeof PlatformRole>;
export const BillingState = z.enum([
  'off',
  'trialing',
  'active',
  'cancel_scheduled',
  'past_due',
  'trial_expired',
  'lapsed',
  'comped',
]);
export type BillingState = z.infer<typeof BillingState>;

export const SettingSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  group: z.string(),
  value_type: z.enum(['integer', 'boolean', 'text', 'integer_array']),
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string().nullable(),
  default: z.unknown(),
  write_role: z.enum(['owner', 'admin']),
  value: z.unknown(),
  updated_at: iso,
  history: z.array(z.object({ old: z.unknown(), new: z.unknown(), reason: z.string(), at: iso })),
});
export type AdminSetting = z.infer<typeof SettingSchema>;

export const BillingMetricsSchema = z.object({
  teams_by_state: z.record(z.string(), z.number()),
  mrr_cents: z.number(),
  trials_ending_7d: z.number(),
  past_due: z.number(),
});
export type AdminBillingMetrics = z.infer<typeof BillingMetricsSchema>;

export const PlatformMetricsSchema = z.object({
  as_of: iso,
  range: z.string(),
  bucket: z.string(),
  totals: z.object({ teams: z.number(), accounts: z.number(), clubs: z.number() }),
  teams_created: series,
  accounts_created: series,
});
export const PaymentMetricsSchema = z.object({
  as_of: iso,
  range: z.string(),
  bucket: z.string(),
  fee_revenue: series,
  volume: series,
  by_status: z.record(z.string(), z.number()),
  refunds: z.number(),
  disputes: z.number(),
});
export const ConnectFunnelSchema = z.object({
  as_of: iso,
  by_status: z.record(z.string(), z.number()),
  charges_enabled: z.number(),
  payouts_enabled: z.number(),
});
export const NotificationMetricsSchema = z.object({
  as_of: iso,
  range: z.string(),
  by_status_channel: z.array(z.object({ status: z.string(), channel: z.string(), n: z.number() })),
  failures: series,
});
export const WebhookMetricsSchema = z.object({
  as_of: iso,
  range: z.string(),
  by_day_outcome: z.array(z.object({ at: iso, outcome: z.string(), n: z.number() })),
});
export const RateLimitMetricsSchema = z.object({ as_of: iso, range: z.string(), hits: series });
export const SnapshotsSchema = z.object({
  as_of: iso,
  range: z.string(),
  first_day: z.string().nullable(),
  items: z.array(
    z.object({
      day: z.string(),
      teams_by_state: z.record(z.string(), z.number()),
      mrr_cents: z.number(),
    }),
  ),
});

const TeamRow = z.object({
  id: z.string(),
  name: z.string(),
  sport: z.string(),
  season_label: z.string(),
  created_at: iso,
  club_name: z.string().nullable(),
  members: z.number(),
  billing_state: BillingState,
});
export const TeamsPageSchema = page(TeamRow);
export const ClubsPageSchema = page(
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    created_at: iso,
    teams: z.number(),
  }),
);
const NoteRow = z.object({
  id: z.number(),
  note: z.string(),
  author: z.string().nullable(),
  at: iso,
});
export const TeamDetailSchema = z
  .object({
    as_of: iso,
    team: z.object({
      id: z.string(),
      name: z.string(),
      sport: z.string(),
      season_label: z.string(),
      created_at: iso,
      club: z.object({ id: z.string(), name: z.string() }).nullable(),
      billing_state: BillingState,
    }),
    staff: z.array(
      z.object({
        profile_id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        role: z.string(),
      }),
    ),
    member_counts: z.record(z.string(), z.number()),
    notes: z.array(NoteRow),
    activity: z.array(
      z.object({
        id: z.number(),
        action: z.string(),
        at: iso,
        actor_id: z.string().nullable(),
        before: z.unknown(),
        after: z.unknown(),
      }),
    ),
  })
  .nullable();
export const ClubDetailSchema = z
  .object({
    as_of: iso,
    club: z.object({ id: z.string(), name: z.string(), slug: z.string(), created_at: iso }),
    teams: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        sport: z.string(),
        billing_state: BillingState,
      }),
    ),
    admins: z.array(
      z.object({
        profile_id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        role: z.string(),
      }),
    ),
    notes: z.array(NoteRow),
  })
  .nullable();
export const TeamPaymentsSchema = page(
  z.object({
    id: z.string(),
    receipt_display_id: z.string().nullable(),
    status: z.string(),
    base_cents: z.number(),
    platform_fee_cents: z.number(),
    total_charged_cents: z.number(),
    fee_policy: z.string(),
    created_at: iso,
    succeeded_at: iso.nullable(),
  }),
);
export const TeamBillingListSchema = z.object({
  items: z.array(
    z.object({
      team_id: z.string(),
      name: z.string(),
      created_at: iso,
      trial_ends_at: iso,
      current_period_end: iso.nullable(),
      cancel_at_period_end: z.boolean(),
      grace_ends_at: iso.nullable(),
      comped: z.boolean(),
      comp_until: iso.nullable(),
      price_mismatch: z.boolean(),
      price_version_id: z.string().nullable(),
      state: BillingState,
    }),
  ),
  next_cursor: cursor.optional(),
});
export const TeamBillingDetailSchema = z
  .object({
    team: z.object({ id: z.string(), name: z.string() }),
    state: BillingState,
    billing: z.record(z.string(), z.unknown()),
    price_version: z.record(z.string(), z.unknown()).nullable(),
    invoices: z.array(z.record(z.string(), z.unknown())),
    events: z.array(
      z.object({ action: z.string(), at: iso, before: z.unknown(), after: z.unknown() }),
    ),
  })
  .nullable();

export const WebhookEventsSchema = page(
  z.object({
    id: z.string(),
    stripe_event_id: z.string(),
    type: z.string(),
    livemode: z.boolean(),
    received_at: iso,
    processed_at: iso.nullable(),
    attempts: z.number(),
    error: z.string().nullable(),
    outcome: z.enum(['failed', 'processed', 'pending']),
  }),
);
export const JobsSchema = z.object({
  as_of: iso,
  items: z.array(
    z.object({
      job_id: z.number(),
      name: z.string().nullable(),
      schedule: z.string(),
      active: z.boolean(),
      interval_minutes: z.number().nullable(),
      last_run_at: iso.nullable(),
      last_status: z.string().nullable(),
      last_duration_ms: z.number().nullable(),
      late: z.boolean(),
    }),
  ),
});
export const ReportsPageSchema = page(
  z.object({
    id: z.string(),
    status: z.enum(['open', 'actioned', 'dismissed']),
    reason: z.string(),
    created_at: iso,
    reviewed_at: iso.nullable(),
    message_id: z.string(),
    reports_on_message: z.number(),
    reporter_name: z.string().nullable(),
    sender_name: z.string().nullable(),
  }),
);
export const EscalationsSchema = z.object({
  as_of: iso,
  items: z.array(
    z.object({
      id: z.string(),
      message_id: z.string(),
      reason: z.string(),
      created_at: iso,
      reports_on_message: z.number(),
      overdue: z.boolean(),
    }),
  ),
});
export const RevealSchema = z.object({
  report_id: z.string(),
  message_id: z.string(),
  body: z.string(),
  sent_at: iso,
  sender: z.string().nullable(),
  removed: z.boolean(),
});
export const AuditPageSchema = page(
  z.object({
    src: z.enum(['platform', 'team']),
    id_text: z.string(),
    at: iso,
    actor_id: z.string().nullable(),
    actor_name: z.string().nullable(),
    action: z.string(),
    target_type: z.string(),
    target_id: z.string().nullable(),
    team_id: z.string().nullable(),
    before: z.unknown(),
    after: z.unknown(),
    reason: z.string().nullable(),
  }),
);
export const AdminsSchema = z.object({
  as_of: iso,
  items: z.array(
    z.object({
      profile_id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      role: PlatformRole,
      since: iso,
      mfa_enrolled: z.boolean(),
    }),
  ),
});
export const PeopleSearchSchema = z.object({
  rate_limited: z.boolean(),
  as_of: iso,
  items: z.array(
    z.object({
      profile_id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      phone_masked: z.string().nullable(),
      created_at: iso,
      team_roles: z.number(),
      households: z.number(),
    }),
  ),
});
export const PersonSchema = z
  .object({
    as_of: iso,
    person: z.object({
      profile_id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      phone_masked: z.string().nullable(),
      created_at: iso,
      last_sign_in_at: iso.nullable(),
    }),
    teams: z.array(
      z.object({ team_id: z.string(), name: z.string(), role: z.string(), status: z.string() }),
    ),
    clubs: z.array(
      z.object({ club_id: z.string(), name: z.string(), role: z.string(), status: z.string() }),
    ),
    households: z.array(
      z.object({
        household_id: z.string(),
        name: z.string(),
        relationship: z.string(),
        members: z.array(z.string()),
      }),
    ),
    push_devices: z.number(),
    notes: z.array(NoteRow),
  })
  .nullable();
export const LookupSchema = z.object({
  rate_limited: z.boolean(),
  as_of: iso,
  kind: z.string().nullable(),
  restricted: z.boolean(),
  items: z.array(z.object({ type: z.string(), id: z.string(), label: z.string() }).passthrough()),
});
export const FeeImpactSchema = z.object({
  as_of: iso,
  current: z.object({ flat_cents: z.number(), bps: z.number(), on_10000: z.number() }),
  proposed: z.object({ flat_cents: z.number(), bps: z.number(), on_10000: z.number() }),
  open_payments: z.number(),
});
export const EnableImpactSchema = z.object({
  as_of: iso,
  enabled: z.boolean(),
  teams: z.number(),
  trial_days: z.number(),
});
export const SportConfigsSchema = z.object({
  as_of: iso,
  items: z.array(z.record(z.string(), z.unknown())),
});

// Reads ------------------------------------------------------------------------------------------------------------------
export type AdminRange = '24h' | '7d' | '30d' | '90d' | '12m';
export type AdminBucket = 'hour' | 'day' | 'week' | 'month';

export const getPlatformRole = async (c: Client) => {
  const { data, error } = await (c as unknown as RpcClient).rpc('platform_admin_role');
  if (error) return fail<PlatformRole | null>(error);
  const parsed = PlatformRole.nullable().safeParse(data ?? null);
  return parsed.success
    ? ({ data: parsed.data, error: null } as Result<PlatformRole | null>)
    : fail<PlatformRole | null>({ message: 'Unexpected role', code: 'bad_shape' });
};
export const listSettings = (c: Client) =>
  call(c, 'admin_list_settings', {}, z.array(SettingSchema));
export const getBillingMetrics = (c: Client) =>
  call(c, 'admin_billing_metrics', {}, BillingMetricsSchema);
export const getPlatformMetrics = (c: Client, range: AdminRange, bucket: AdminBucket) =>
  call(c, 'admin_platform_metrics', { p_range: range, p_bucket: bucket }, PlatformMetricsSchema);
export const getPaymentMetrics = (c: Client, range: AdminRange, bucket: AdminBucket) =>
  call(c, 'admin_payment_metrics', { p_range: range, p_bucket: bucket }, PaymentMetricsSchema);
export const getConnectFunnel = (c: Client) =>
  call(c, 'admin_connect_funnel', {}, ConnectFunnelSchema);
export const getNotificationMetrics = (c: Client, range: AdminRange) =>
  call(c, 'admin_notification_metrics', { p_range: range }, NotificationMetricsSchema);
export const getWebhookMetrics = (c: Client, range: AdminRange) =>
  call(c, 'admin_webhook_metrics', { p_range: range }, WebhookMetricsSchema);
export const getRateLimitMetrics = (c: Client, range: AdminRange) =>
  call(c, 'admin_rate_limit_metrics', { p_range: range }, RateLimitMetricsSchema);
export const getBillingSnapshots = (c: Client, range: AdminRange) =>
  call(c, 'admin_billing_snapshots', { p_range: range }, SnapshotsSchema);
export const listJobs = (c: Client) => call(c, 'admin_list_jobs', {}, JobsSchema);
export const listWebhookEvents = (
  c: Client,
  outcome: string | null,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(
    c,
    'admin_list_webhook_events',
    { p_outcome: outcome, p_limit: limit, p_cursor: cur },
    WebhookEventsSchema,
  );

export const listTeams = (
  c: Client,
  search: string | null,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(c, 'admin_list_teams', { p_search: search, p_limit: limit, p_cursor: cur }, TeamsPageSchema);
export const getTeam = (c: Client, teamId: string) =>
  call(c, 'admin_get_team', { p_team_id: teamId }, TeamDetailSchema);
export const listTeamPayments = (
  c: Client,
  teamId: string,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(
    c,
    'admin_list_team_payments',
    { p_team_id: teamId, p_limit: limit, p_cursor: cur },
    TeamPaymentsSchema,
  );
export const listTeamBilling = (
  c: Client,
  state: BillingState | null,
  search: string | null,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(
    c,
    'admin_list_team_billing',
    { p_state: state, p_search: search, p_limit: limit, p_cursor: cur },
    TeamBillingListSchema,
  );
export const getTeamBillingDetail = (c: Client, teamId: string) =>
  call(c, 'admin_get_team_billing', { p_team_id: teamId }, TeamBillingDetailSchema);
export const listClubs = (
  c: Client,
  search: string | null,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(c, 'admin_list_clubs', { p_search: search, p_limit: limit, p_cursor: cur }, ClubsPageSchema);
export const getClub = (c: Client, clubId: string) =>
  call(c, 'admin_get_club', { p_club_id: clubId }, ClubDetailSchema);

export const listMessageReports = (
  c: Client,
  status: 'open' | 'actioned' | 'dismissed' | null,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(
    c,
    'admin_list_message_reports',
    { p_status: status, p_limit: limit, p_cursor: cur },
    ReportsPageSchema,
  );
export const listEscalations = (c: Client) =>
  call(c, 'admin_list_escalations', {}, EscalationsSchema);
export interface AuditFilters {
  source?: 'platform' | 'team';
  action?: string;
  actor?: string;
  team?: string;
  from?: string;
  to?: string;
}
export const listAudit = (
  c: Client,
  filters: AuditFilters,
  limit: number,
  cur: Record<string, unknown> | null,
) =>
  call(
    c,
    'admin_list_audit',
    { p_filters: filters, p_limit: limit, p_cursor: cur },
    AuditPageSchema,
  );
export const listAdmins = (c: Client) => call(c, 'admin_list_admins', {}, AdminsSchema);
export const searchPeople = (c: Client, query: string) =>
  call(c, 'admin_search_people', { p_query: query }, PeopleSearchSchema);
export const getPerson = (c: Client, userId: string) =>
  call(c, 'admin_get_person', { p_user_id: userId }, PersonSchema);
export const lookup = (c: Client, term: string) =>
  call(c, 'admin_lookup', { p_term: term }, LookupSchema);
export const feeConfigImpact = (c: Client, flatCents: number, bps: number) =>
  call(c, 'admin_fee_config_impact', { p_flat_cents: flatCents, p_bps: bps }, FeeImpactSchema);
export const enableTeamBillingImpact = (c: Client) =>
  call(c, 'admin_enable_team_billing_impact', {}, EnableImpactSchema);
export const listSportConfigs = (c: Client) =>
  call(c, 'admin_list_sport_configs', {}, SportConfigsSchema);
export const getPlatformBanner = (c: Client) =>
  call(c, 'get_platform_banner', {}, z.string().nullable());

// Writes (aal2 + reason). Every one returns a typed error: see adminErrorCode. -----------------------------------------------
export const setSetting = (c: Client, key: string, value: unknown, reason: string) =>
  callVoid(c, 'admin_set_setting', { p_key: key, p_value: value, p_reason: reason });
export const extendTrial = (c: Client, teamId: string, newEnd: string, reason: string) =>
  callVoid(c, 'admin_extend_trial', {
    p_team_id: teamId,
    p_new_trial_ends_at: newEnd,
    p_reason: reason,
  });
export const compTeam = (c: Client, teamId: string, until: string | null, reason: string) =>
  callVoid(c, 'admin_comp_team', { p_team_id: teamId, p_until: until, p_reason: reason });
export const clearComp = (c: Client, teamId: string, reason: string) =>
  callVoid(c, 'admin_clear_comp', { p_team_id: teamId, p_reason: reason });
export interface FeeConfigInput {
  flatCents: number;
  bps: number;
  stripeBps: number;
  stripeFixedCents: number;
  refundChargeFull: boolean;
  refundChargePartial: boolean;
  refundServiceFull: boolean;
  refundServicePartial: boolean;
}
export const setFeeConfig = (c: Client, f: FeeConfigInput, reason: string) =>
  call(
    c,
    'admin_set_fee_config',
    {
      p_flat_cents: f.flatCents,
      p_bps: f.bps,
      p_stripe_bps: f.stripeBps,
      p_stripe_fixed_cents: f.stripeFixedCents,
      p_refund_charge_full: f.refundChargeFull,
      p_refund_charge_partial: f.refundChargePartial,
      p_refund_service_full: f.refundServiceFull,
      p_refund_service_partial: f.refundServicePartial,
      p_reason: reason,
    },
    z.string(),
  );
export const enableTeamBilling = (c: Client, reason: string) =>
  call(c, 'admin_enable_team_billing', { p_reason: reason }, z.number());
export const disableTeamBilling = (c: Client, reason: string) =>
  callVoid(c, 'admin_disable_team_billing', { p_reason: reason });
export interface SportConfigInput {
  sport: string;
  periodType: string;
  periodCount: number;
  periodMinutes: number | null;
  tiesAllowed: boolean;
  positions: string[];
  scoringLabel: string;
}
export const setSportConfig = (c: Client, s: SportConfigInput, reason: string) =>
  callVoid(c, 'admin_set_sport_config', {
    p_sport: s.sport,
    p_period_type: s.periodType,
    p_period_count: s.periodCount,
    p_period_minutes: s.periodMinutes,
    p_ties_allowed: s.tiesAllowed,
    p_positions: s.positions,
    p_scoring_label: s.scoringLabel,
    p_reason: reason,
  });
export const reviewMessageReport = (
  c: Client,
  reportId: string,
  action: 'action' | 'dismiss',
  reason: string,
) =>
  callVoid(c, 'admin_review_message_report', {
    p_report_id: reportId,
    p_action: action,
    p_reason: reason,
  });
export const revealReportedMessage = (c: Client, reportId: string, reason: string) =>
  call(
    c,
    'admin_reveal_reported_message',
    { p_report_id: reportId, p_reason: reason },
    RevealSchema,
  );
export const addAdmin = (c: Client, email: string, role: PlatformRole, reason: string) =>
  callVoid(c, 'admin_add_admin', { p_email: email, p_role: role, p_reason: reason });
export const setAdminRole = (c: Client, profileId: string, role: PlatformRole, reason: string) =>
  callVoid(c, 'admin_set_admin_role', { p_profile_id: profileId, p_role: role, p_reason: reason });
export const removeAdmin = (c: Client, profileId: string, reason: string) =>
  callVoid(c, 'admin_remove_admin', { p_profile_id: profileId, p_reason: reason });
export const addSupportNote = (
  c: Client,
  subjectType: 'team' | 'club' | 'person',
  subjectId: string,
  note: string,
) =>
  call(
    c,
    'admin_add_support_note',
    { p_subject_type: subjectType, p_subject_id: subjectId, p_note: note },
    z.number(),
  );
