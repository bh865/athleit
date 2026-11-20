import { z } from 'zod';

import type { Client, Result } from './api';

/**
 * Typed access to the support center: the requester functions (signed in), the public Edge Functions and the staff
 * functions behind /admin/support. Every function checks ownership or the platform role in the database; nothing here
 * decides permissions. Returned JSON is validated with Zod. Never call staff functions with a service-role client.
 */

export const SUPPORT_ERROR_CODES = [
  'rate_limited',
  'request_closed',
  'reopen_window_passed',
  'unknown_request',
  'invalid_subject',
  'invalid_body',
  'invalid_type',
  'public_tickets_disabled',
  'captcha_failed',
  'mfa_required',
  'not_authorized',
  'not_authenticated',
  'reason_required',
  'request_held',
  'same_request',
  'already_merged',
  'already_redacted',
] as const;
export type SupportErrorCode = (typeof SUPPORT_ERROR_CODES)[number] | 'unknown';
export const supportErrorCode = (
  e: { message?: string | undefined } | null | undefined,
): SupportErrorCode => SUPPORT_ERROR_CODES.find((c) => (e?.message ?? '').includes(c)) ?? 'unknown';

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
  return parsed.success
    ? { data: parsed.data, error: null }
    : fail({
        message: `Unexpected response from ${fn}: ${parsed.error.message}`,
        code: 'bad_shape',
      });
}
async function callVoid(
  c: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<Result<null>> {
  const { error } = await (c as unknown as RpcClient).rpc(fn, args);
  return error ? fail(error) : { data: null, error: null };
}

// Schemas -------------------------------------------------------------------------------------------------------
export const SupportType = z.enum(['question', 'problem', 'billing', 'feedback']);
export type SupportType = z.infer<typeof SupportType>;
/** What a requester sees: new and open are one "open". */
export const RequesterStatus = z.enum(['open', 'waiting_on_requester', 'solved', 'closed']);
export type RequesterStatus = z.infer<typeof RequesterStatus>;
export const StaffStatus = z.enum(['new', 'open', 'waiting_on_requester', 'solved', 'closed']);
export const Priority = z.enum(['low', 'normal', 'high', 'urgent']);
export type Priority = z.infer<typeof Priority>;

export const MyRequestRow = z.object({
  ref: z.string(),
  subject: z.string(),
  type: SupportType,
  status: RequesterStatus,
  last_activity_at: z.string(),
  unread: z.boolean(),
});
export const MyRequestList = z.object({ items: z.array(MyRequestRow), unread_count: z.number() });
export type MyRequestRow = z.infer<typeof MyRequestRow>;

const Message = z.object({
  id: z.string(),
  author_kind: z.enum(['requester', 'staff', 'system']),
  author_name: z.string().nullable().optional(),
  body: z.string(),
  created_at: z.string(),
});
const Attachment = z.object({
  id: z.string(),
  message_id: z.string().nullable(),
  file_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  path: z.string().optional(),
});
export const MyRequest = z.object({
  ref: z.string(),
  type: SupportType,
  subject: z.string(),
  held: z.boolean(),
  status: RequesterStatus,
  created_at: z.string(),
  last_activity_at: z.string(),
  diagnostics: z.record(z.string(), z.unknown()),
  satisfaction: z.enum(['yes', 'no']).nullable(),
  can_reply: z.boolean(),
  can_reopen: z.boolean(),
  messages: z.array(Message),
  attachments: z.array(Attachment),
});
export type MyRequest = z.infer<typeof MyRequest>;
export type SupportMessage = z.infer<typeof Message>;

// Requester (signed in) --------------------------------------------------------------------------------------------
export interface NewSupportRequest {
  type: SupportType;
  subject: string;
  body: string;
  teamId?: string | null;
  clubId?: string | null;
  sourceArticle?: string | null;
  sourceRoute?: string | null;
  diagnostics?: Record<string, string>;
}
export const createSupportRequest = (c: Client, r: NewSupportRequest) =>
  call(
    c,
    'create_support_request',
    {
      p_type: r.type,
      p_subject: r.subject,
      p_body: r.body,
      p_team_id: r.teamId ?? null,
      p_club_id: r.clubId ?? null,
      p_source_article: r.sourceArticle ?? null,
      p_source_route: r.sourceRoute ?? null,
      p_diagnostics: r.diagnostics ?? {},
    },
    z.object({ id: z.string(), ref: z.string(), message_id: z.string() }),
  );
export const replyToSupportRequest = (c: Client, ref: string, body: string) =>
  call(c, 'reply_to_support_request', { p_ref: ref, p_body: body }, z.string());
export const getMySupportRequests = (
  c: Client,
  o: { status?: RequesterStatus | null; cursor?: string | null; limit?: number } = {},
) =>
  call(
    c,
    'get_my_support_requests',
    { p_status: o.status ?? null, p_cursor: o.cursor ?? null, p_limit: o.limit ?? 25 },
    MyRequestList,
  );
export const getMySupportRequest = (c: Client, ref: string) =>
  call(c, 'get_my_support_request', { p_ref: ref }, MyRequest);
export const markSupportRead = (c: Client, ref: string) =>
  callVoid(c, 'mark_support_read', { p_ref: ref });
export const markSupportSolved = (c: Client, ref: string) =>
  callVoid(c, 'mark_support_request_solved', { p_ref: ref });
export const reopenSupportRequest = (c: Client, ref: string) =>
  callVoid(c, 'reopen_support_request', { p_ref: ref });
export const rateSupportRequest = (
  c: Client,
  ref: string,
  satisfaction: 'yes' | 'no',
  comment?: string,
) =>
  callVoid(c, 'rate_support_request', {
    p_ref: ref,
    p_satisfaction: satisfaction,
    p_comment: comment ?? null,
  });

// Edge Functions ------------------------------------------------------------------------------------------------------
async function invoke<T>(
  c: Client,
  name: string,
  body: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await c.functions.invoke(name, { body });
  if (!error) return { data: data as T, error: null };
  let code = error.message;
  try {
    const j = (await (error as { context?: Response }).context?.json()) as { error?: string };
    if (j?.error) code = j.error;
  } catch {
    /* keep the generic message */
  }
  return fail({ message: code });
}

export interface PublicSubmitInput {
  type: SupportType;
  subject: string;
  body: string;
  email: string;
  name?: string;
  captchaToken: string;
  sourceArticle?: string | null;
  sourceRoute?: string | null;
  diagnostics?: Record<string, string>;
  files?: { name: string; type: string; size: number }[];
}
export interface PublicSubmitResult {
  ok: true;
  ref: string;
  held: boolean;
  request_id: string;
  finalize_token: string | null;
  uploads: { path: string; token: string }[];
}
/** Signed-out creation. The answer is the same whether or not the email has an account. */
export const submitPublicSupportRequest = (c: Client, i: PublicSubmitInput) =>
  invoke<PublicSubmitResult>(c, 'submit-support-request', {
    type: i.type,
    subject: i.subject,
    body: i.body,
    email: i.email,
    name: i.name,
    captcha_token: i.captchaToken,
    source_article: i.sourceArticle,
    source_route: i.sourceRoute,
    diagnostics: i.diagnostics,
    files: i.files,
  });
export const finalizeSupportAttachments = (
  c: Client,
  requestId: string,
  files: { path: string; name: string }[],
  token?: string | null,
) =>
  invoke<{ results: { path: string; ok: boolean; error?: string }[] }>(
    c,
    'finalize-support-attachments',
    { request_id: requestId, token: token ?? undefined, files },
  );
export const viewSupportRequestByToken = (c: Client, token: string) =>
  invoke<{ request: MyRequest }>(c, 'get-support-request-by-token', { token });
export const replyByToken = (c: Client, token: string, body: string) =>
  invoke<{ ok: true }>(c, 'reply-by-token', { token, body });

// Staff (/admin/support) -------------------------------------------------------------------------------------------------
export const SUPPORT_VIEWS = [
  'mine',
  'unassigned',
  'waiting',
  'billing',
  'ideas',
  'overdue',
  'held',
  'spam',
] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

const AdminRow = z.object({
  id: z.string(),
  ref: z.string(),
  subject: z.string(),
  type: SupportType,
  status: StaffStatus,
  priority: Priority,
  held: z.boolean(),
  created_at: z.string(),
  first_reply_at: z.string().nullable(),
  last_activity_at: z.string(),
  requester_name: z.string().nullable(),
  signed_in: z.boolean(),
  requester_role: z.string().nullable(),
  team_name: z.string().nullable(),
  assignee_name: z.string().nullable(),
  assignee_profile_id: z.string().nullable(),
  overdue: z.boolean(),
});
export type AdminSupportRow = z.infer<typeof AdminRow>;
export interface AdminSupportFilters {
  view?: SupportView | null;
  status?: z.infer<typeof StaffStatus> | null;
  type?: SupportType | null;
  priority?: Priority | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number;
}
export const adminListSupportRequests = (c: Client, f: AdminSupportFilters = {}) =>
  call(
    c,
    'admin_list_support_requests',
    {
      p_view: f.view ?? null,
      p_status: f.status ?? null,
      p_type: f.type ?? null,
      p_priority: f.priority ?? null,
      p_search: f.search ?? null,
      p_cursor: f.cursor ?? null,
      p_limit: f.limit ?? 25,
    },
    z.object({ as_of: z.string(), first_reply_target_hours: z.number(), items: z.array(AdminRow) }),
  );

const AdminMessage = Message.extend({ internal: z.boolean(), redacted: z.boolean() });
export const AdminSupportDetail = z.object({
  as_of: z.string(),
  request: z.record(z.string(), z.unknown()),
  overdue: z.boolean(),
  requester: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    profile_id: z.string().nullable(),
    signed_in: z.boolean(),
    past_requests: z.number(),
  }),
  team: z
    .object({ id: z.string(), name: z.string(), billing_state: z.string().nullable() })
    .nullable(),
  club: z.object({ id: z.string(), name: z.string() }).nullable(),
  assignee_name: z.string().nullable(),
  messages: z.array(AdminMessage),
  attachments: z.array(Attachment.omit({ path: true })),
  related: z.array(
    z.object({ id: z.string(), ref: z.string(), subject: z.string(), status: z.string() }),
  ),
  events: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      before: z.unknown(),
      after: z.unknown(),
      at: z.string(),
      actor_name: z.string().nullable(),
    }),
  ),
});
export type AdminSupportDetail = z.infer<typeof AdminSupportDetail>;
export const adminGetSupportRequest = (c: Client, id: string) =>
  call(c, 'admin_get_support_request', { p_id: id }, AdminSupportDetail);

// Routine work [support]: no MFA, no reason.
export const adminReplySupport = (
  c: Client,
  id: string,
  body: string,
  o: { internal?: boolean; status?: 'open' | 'waiting_on_requester' | 'solved' | null } = {},
) =>
  call(
    c,
    'admin_reply_support_request',
    { p_id: id, p_body: body, p_internal: o.internal ?? false, p_status: o.status ?? null },
    z.string(),
  );
export const adminAssignSupport = (c: Client, id: string, assignee: string | null) =>
  callVoid(c, 'admin_assign_support_request', { p_id: id, p_assignee: assignee });
export const adminSetSupportStatus = (
  c: Client,
  id: string,
  status: 'open' | 'waiting_on_requester' | 'solved' | 'closed',
) => callVoid(c, 'admin_set_support_status', { p_id: id, p_status: status });
export const adminSetSupportPriority = (c: Client, id: string, priority: Priority) =>
  callVoid(c, 'admin_set_support_priority', { p_id: id, p_priority: priority });
export const adminTagSupport = (c: Client, id: string, tags: string[]) =>
  callVoid(c, 'admin_tag_support_request', { p_id: id, p_tags: tags });
export const adminLinkSupportArticle = (c: Client, id: string, slug: string | null) =>
  callVoid(c, 'admin_link_support_article', { p_id: id, p_slug: slug });
export const adminReleaseSupportHold = (c: Client, id: string) =>
  callVoid(c, 'admin_release_support_hold', { p_id: id });

// Sensitive [admin]: aal2 and a reason of 10+ characters, written to the platform audit log.
export const adminMergeSupport = (c: Client, source: string, target: string, reason: string) =>
  callVoid(c, 'admin_merge_support_requests', {
    p_source: source,
    p_target: target,
    p_reason: reason,
  });
export const adminMarkSupportSpam = (c: Client, id: string, reason: string) =>
  callVoid(c, 'admin_mark_support_spam', { p_id: id, p_reason: reason });
export const adminRedactSupportMessage = (c: Client, messageId: string, reason: string) =>
  callVoid(c, 'admin_redact_support_message', { p_message_id: messageId, p_reason: reason });
export const adminDeleteSupportAttachment = (c: Client, attachmentId: string, reason: string) =>
  callVoid(c, 'admin_delete_support_attachment', {
    p_attachment_id: attachmentId,
    p_reason: reason,
  });
export const adminExportSupport = (c: Client, range: string, reason: string) =>
  call(
    c,
    'admin_export_support_requests',
    { p_range: range, p_reason: reason },
    z.object({ as_of: z.string(), items: z.array(z.record(z.string(), z.unknown())) }),
  );
export const adminSetFeedbackStatus = (
  c: Client,
  id: string,
  status: 'new' | 'considering' | 'planned' | 'shipped' | 'wont_do',
  reason: string,
) => callVoid(c, 'admin_set_feedback_status', { p_id: id, p_status: status, p_reason: reason });

export const CannedReply = z.object({
  id: z.string(),
  title: z.string(),
  shortcut: z.string(),
  body: z.string(),
  active: z.boolean(),
});
export type CannedReply = z.infer<typeof CannedReply>;
export const adminListCannedReplies = (c: Client) =>
  call(c, 'admin_list_canned_replies', {}, z.object({ items: z.array(CannedReply) }));
export const adminSaveCannedReply = (
  c: Client,
  r: { id?: string | null; title: string; shortcut: string; body: string; active?: boolean },
  reason: string,
) =>
  call(
    c,
    'admin_save_canned_reply',
    {
      p_id: r.id ?? null,
      p_title: r.title,
      p_shortcut: r.shortcut,
      p_body: r.body,
      p_active: r.active ?? true,
      p_reason: reason,
    },
    z.string(),
  );
export const adminDeleteCannedReply = (c: Client, id: string, reason: string) =>
  callVoid(c, 'admin_delete_canned_reply', { p_id: id, p_reason: reason });

export const adminListFeedback = (c: Client, status?: string | null) =>
  call(
    c,
    'admin_list_feedback',
    { p_status: status ?? null },
    z.object({
      as_of: z.string(),
      items: z.array(
        z.object({
          label: z.string(),
          tagged: z.boolean(),
          count: z.number(),
          last_at: z.string(),
          feedback_status: z.string().nullable(),
          requests: z.array(z.object({ id: z.string(), ref: z.string(), subject: z.string() })),
        }),
      ),
    }),
  );
export const adminSupportArticleStats = (c: Client) =>
  call(
    c,
    'admin_support_article_stats',
    {},
    z.object({
      as_of: z.string(),
      feedback: z.array(z.object({ slug: z.string(), yes: z.number(), no: z.number() })),
      tickets_30d: z.array(z.object({ slug: z.string(), count: z.number() })),
      status: z.array(
        z.object({
          slug: z.string(),
          stale: z.boolean(),
          stale_paths: z.array(z.string()),
          checked_at: z.string(),
        }),
      ),
      misses: z.array(z.object({ query: z.string(), hits: z.number() })),
      comments: z.array(z.object({ slug: z.string(), comment: z.string(), at: z.string() })),
    }),
  );
export const adminSupportMetrics = (c: Client, range = '30d') =>
  call(
    c,
    'admin_support_metrics',
    { p_range: range },
    z.object({
      as_of: z.string(),
      range: z.string(),
      per_week: z.array(z.object({ week: z.string(), type: z.string(), count: z.number() })),
      first_reply_hours: z.object({
        median: z.number().nullable(),
        p90: z.number().nullable(),
        n: z.number(),
      }),
      time_to_solve_hours: z.object({ median: z.number().nullable(), n: z.number() }),
      open_by_age: z.object({
        lt_1d: z.number(),
        d1_3: z.number(),
        d3_7: z.number(),
        gt_7d: z.number(),
      }),
      satisfaction: z.object({ yes: z.number(), no: z.number() }),
      top_articles: z.array(z.object({ slug: z.string(), count: z.number() })),
      top_misses: z.array(z.object({ query: z.string(), hits: z.number() })),
      tickets_per_100_teams: z.number(),
      overview: z.object({
        open: z.number(),
        overdue: z.number(),
        oldest_unanswered: z.string().nullable(),
        held: z.number(),
        stale_articles: z.number(),
      }),
    }),
  );
/** A 60 second, download-only URL for an attachment (the Edge Function checks the platform role). */
export const adminSignSupportAttachment = (c: Client, attachmentId: string) =>
  invoke<{ url: string }>(c, 'sign-support-attachment', { attachment_id: attachmentId });
