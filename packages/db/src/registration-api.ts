import type { Client, Result } from './api';
import type { Database, Json } from './database.types';

/**
 * Typed data access for Phase 5 (registration, forms, waivers, documents). Reads use database functions; every
 * write is a database function or an Edge Function. Nothing here decides access: the database does, and the
 * public Edge Functions apply their own rate limits, captcha and validation.
 */
type Fn = Database['public']['Functions'];
export type RegistrationListRow = Fn['list_registrations']['Returns'][number];
export type CapacitySummary = Fn['registration_capacity_summary']['Returns'][number];
export type MyRegistrationRow = Fn['list_my_registrations']['Returns'][number];
export type OpenEventRow = Fn['list_open_registration_events']['Returns'][number];
export type DocumentRow = Fn['list_documents']['Returns'][number];
export type ComplianceRow = Fn['waiver_compliance']['Returns'][number];
export type PaymentStatusRow = Fn['registration_payment_status']['Returns'][number];

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(
  e: { message?: string; code?: string; details?: string | null } | null,
): Result<T> => ({
  data: null,
  error: { message: e?.message ?? 'Unknown error', code: e?.code, details: e?.details },
});
const NULL = null as unknown as string;

export interface Owner {
  teamId?: string | undefined;
  clubId?: string | undefined;
}

// ------------------------------------------------------------------------------------------------ public Edge calls
export interface EdgeConfig {
  url: string;
  anonKey: string;
}
export interface EdgeResult<T = Record<string, unknown>> {
  status: number;
  ok: boolean;
  body: T;
}

/** Calls a public registration Edge Function. Pass the user's access token only when signed in. */
export async function callRegistrationFn<T = Record<string, unknown>>(
  cfg: EdgeConfig,
  name:
    | 'get-public-registration'
    | 'submit-registration'
    | 'verify-registration'
    | 'sign-waiver'
    | 'claim-registration'
    | 'export-registrations',
  body: unknown,
  accessToken?: string | null,
): Promise<EdgeResult<T>> {
  try {
    const res = await fetch(`${cfg.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: cfg.anonKey,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, ok: res.ok, body: json };
  } catch {
    return { status: 0, ok: false, body: { error: 'network' } as T };
  }
}

export interface PublicRegistration {
  slug: string;
  title: string;
  kind: string;
  sport: string | null;
  summary: string | null;
  info_blocks: Json;
  starts_on: string | null;
  ends_on: string | null;
  location_text: string | null;
  opens_at: string | null;
  closes_at: string | null;
  eligibility: Json;
  price_cents: number | null;
  payment_timing: string;
  requires_account: boolean;
  issuer_name: string | null;
  contact_email: string | null;
  cover_url?: string;
  state: 'upcoming' | 'open' | 'closed';
  spots: string;
  waitlist_enabled: boolean;
  noindex: boolean;
  form: { version_id: string; schema: Json };
  waivers: { version_id: string; title: string }[];
}

export async function fetchPublicRegistration(
  cfg: EdgeConfig,
  slug: string,
  accessToken?: string | null,
): Promise<PublicRegistration | null> {
  const r = await callRegistrationFn<PublicRegistration>(
    cfg,
    'get-public-registration',
    { slug },
    accessToken,
  );
  return r.ok ? r.body : null;
}

// --------------------------------------------------------------------------------------------- registrant side
export async function listMyRegistrations(c: Client): Promise<Result<MyRegistrationRow[]>> {
  const { data, error } = await c.rpc('list_my_registrations');
  return error ? fail(error) : ok(data ?? []);
}
export async function listOpenRegistrationEvents(c: Client): Promise<Result<OpenEventRow[]>> {
  const { data, error } = await c.rpc('list_open_registration_events');
  return error ? fail(error) : ok(data ?? []);
}
export async function withdrawRegistration(c: Client, id: string): Promise<Result<Json>> {
  const { data, error } = await c.rpc('withdraw_registration', { p_registration_id: id });
  return error ? fail(error) : ok(data);
}
export async function getRegistrationDetail(
  c: Client,
  id: string,
): Promise<Result<Record<string, any>>> {
  const { data, error } = await c.rpc('get_registration_detail', { p_registration_id: id });
  return error ? fail(error) : ok((data ?? {}) as Record<string, unknown>);
}
export async function getRegistrationPaymentStatus(
  c: Client,
  id: string,
): Promise<Result<PaymentStatusRow | null>> {
  const { data, error } = await c.rpc('registration_payment_status', { p_registration_id: id });
  return error ? fail(error) : ok(data?.[0] ?? null);
}

// ---------------------------------------------------------------------------------------------------- staff side
export interface RegistrationFilters {
  status?: string[];
  search?: string;
  unpaid?: boolean;
  missingWaivers?: boolean;
  limit?: number;
  offset?: number;
}
export async function listRegistrationEvents(c: Client, o: Owner) {
  let q = c
    .from('registration_events')
    .select(
      'id, title, slug, status, kind, capacity, price_cents, opens_at, closes_at, visibility, starts_on, team_id, club_id',
    )
    .order('created_at', { ascending: false });
  if (o.teamId) q = q.eq('team_id', o.teamId);
  if (o.clubId) q = q.eq('club_id', o.clubId);
  const { data, error } = await q;
  return error ? fail(error) : ok(data ?? []);
}
export async function getRegistrationEvent(c: Client, id: string) {
  const { data, error } = await c.from('registration_events').select('*').eq('id', id).single();
  return error ? fail(error) : ok(data);
}
export async function listRegistrations(c: Client, eventId: string, f: RegistrationFilters = {}) {
  const { data, error } = await c.rpc('list_registrations', {
    p_event_id: eventId,
    ...(f.status?.length ? { p_status: f.status } : {}),
    ...(f.search ? { p_search: f.search } : {}),
    ...(f.unpaid ? { p_unpaid: true } : {}),
    ...(f.missingWaivers ? { p_missing_waivers: true } : {}),
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  });
  return error ? fail(error) : ok(data ?? []);
}
export async function getCapacitySummary(
  c: Client,
  eventId: string,
): Promise<Result<CapacitySummary | null>> {
  const { data, error } = await c.rpc('registration_capacity_summary', { p_event_id: eventId });
  return error ? fail(error) : ok(data?.[0] ?? null);
}
export async function decideRegistration(
  c: Client,
  id: string,
  decision: 'accept' | 'waitlist' | 'decline',
  message?: string,
) {
  const { data, error } = await c.rpc('decide_registration', {
    p_registration_id: id,
    p_decision: decision,
    ...(message ? { p_message: message } : {}),
  });
  return error ? fail<Json>(error) : ok(data);
}
export async function promoteFromWaitlist(c: Client, eventId: string) {
  const { data, error } = await c.rpc('promote_from_waitlist', { p_event_id: eventId });
  return error ? fail<string>(error) : ok(data);
}
export async function placeRegisteredPlayer(
  c: Client,
  a: { registrationId: string; teamId: string; jerseyNumber?: number; position?: string },
) {
  const { data, error } = await c.rpc('place_registered_player', {
    p_registration_id: a.registrationId,
    p_team_id: a.teamId,
    ...(a.jerseyNumber !== undefined ? { p_jersey_number: a.jerseyNumber } : {}),
    ...(a.position ? { p_position: a.position } : {}),
  });
  return error ? fail<string>(error) : ok(data);
}
export async function addRegistrationNote(c: Client, id: string, body: string) {
  const { data, error } = await c.rpc('add_registration_note', {
    p_registration_id: id,
    p_body: body,
  });
  return error ? fail<string>(error) : ok(data);
}
/** Audited server-side: every call writes an audit_log row. Never cache the result. */
export async function getSensitiveAnswers(c: Client, id: string) {
  const { data, error } = await c.rpc('get_sensitive_answers', { p_registration_id: id });
  return error ? fail<Json>(error) : ok(data);
}
export async function exportRegistrationRows(
  c: Client,
  eventId: string,
  includeSensitive: boolean,
) {
  const { data, error } = await c.rpc('export_registrations', {
    p_event_id: eventId,
    p_include_sensitive: includeSensitive,
  });
  return error ? fail<Json>(error) : ok(data);
}

// ------------------------------------------------------------------------------------------------- authoring
export async function createRegistrationEvent(c: Client, o: Owner, data: Json) {
  const { data: id, error } = await c.rpc('create_registration_event', {
    p_team_id: o.teamId ?? NULL,
    p_club_id: o.clubId ?? NULL,
    p_data: data,
  });
  return error ? fail<string>(error) : ok(id);
}
export async function updateRegistrationEvent(c: Client, id: string, data: Json) {
  const { error } = await c.rpc('update_registration_event', { p_event_id: id, p_data: data });
  return error ? fail<null>(error) : ok(null);
}
export async function setRegistrationEventState(
  c: Client,
  id: string,
  action: 'publish' | 'close' | 'archive',
) {
  const fn = `${action}_registration_event` as const;
  const { error } = await c.rpc(fn, { p_event_id: id });
  return error ? fail<null>(error) : ok(null);
}
export async function listForms(c: Client, o: Owner) {
  let q = c
    .from('forms')
    .select('id, name, team_id, club_id, current_version_id, updated_at')
    .order('updated_at', { ascending: false });
  if (o.teamId) q = q.eq('team_id', o.teamId);
  if (o.clubId) q = q.eq('club_id', o.clubId);
  const { data, error } = await q;
  return error ? fail(error) : ok(data ?? []);
}
export async function getForm(c: Client, id: string) {
  const { data, error } = await c.from('forms').select('*').eq('id', id).single();
  return error ? fail(error) : ok(data);
}
export async function createForm(c: Client, o: Owner, name: string, schema?: Json) {
  const { data, error } = await c.rpc('create_form', {
    p_team_id: o.teamId ?? NULL,
    p_club_id: o.clubId ?? NULL,
    p_name: name,
    ...(schema ? { p_schema: schema } : {}),
  });
  return error ? fail<string>(error) : ok(data);
}
export async function saveFormDraft(c: Client, id: string, name: string, schema: Json) {
  const { error } = await c.rpc('save_form_draft', {
    p_form_id: id,
    p_name: name,
    p_schema: schema,
  });
  return error ? fail<null>(error) : ok(null);
}
export async function publishFormVersion(c: Client, id: string) {
  const { data, error } = await c.rpc('publish_form_version', { p_form_id: id });
  return error ? fail<string>(error) : ok(data);
}
export async function listWaivers(c: Client, o: Owner) {
  let q = c
    .from('waivers')
    .select('id, title, team_id, club_id, current_version_id, updated_at')
    .order('updated_at', { ascending: false });
  if (o.teamId) q = q.eq('team_id', o.teamId);
  if (o.clubId) q = q.eq('club_id', o.clubId);
  const { data, error } = await q;
  return error ? fail(error) : ok(data ?? []);
}
export async function getWaiver(c: Client, id: string) {
  const { data, error } = await c.from('waivers').select('*').eq('id', id).single();
  return error ? fail(error) : ok(data);
}
export async function createWaiver(
  c: Client,
  o: Owner,
  title: string,
  body: string,
  resignDays?: number,
) {
  const { data, error } = await c.rpc('create_waiver', {
    p_team_id: o.teamId ?? NULL,
    p_club_id: o.clubId ?? NULL,
    p_title: title,
    p_body: body,
    ...(resignDays ? { p_requires_resign_after_days: resignDays } : {}),
  });
  return error ? fail<string>(error) : ok(data);
}
export async function saveWaiverDraft(
  c: Client,
  id: string,
  title: string,
  body: string,
  resignDays?: number,
) {
  const { error } = await c.rpc('save_waiver_draft', {
    p_waiver_id: id,
    p_title: title,
    p_body: body,
    ...(resignDays ? { p_requires_resign_after_days: resignDays } : {}),
  });
  return error ? fail<null>(error) : ok(null);
}
export async function publishWaiverVersion(c: Client, id: string) {
  const { data, error } = await c.rpc('publish_waiver_version', { p_waiver_id: id });
  return error ? fail<string>(error) : ok(data);
}
export async function setTeamRequiredWaiver(
  c: Client,
  teamId: string,
  waiverId: string,
  required: boolean,
) {
  const { error } = await c.rpc('set_team_required_waiver', {
    p_team_id: teamId,
    p_waiver_id: waiverId,
    p_required: required,
  });
  return error ? fail<null>(error) : ok(null);
}
export async function getWaiverCompliance(c: Client, teamId: string) {
  const { data, error } = await c.rpc('waiver_compliance', { p_team_id: teamId });
  return error ? fail(error) : ok(data ?? []);
}

// ------------------------------------------------------------------------------------------------- documents
export async function listDocuments(c: Client, o: Owner, includeArchived = false) {
  const { data, error } = await c.rpc('list_documents', {
    ...(o.teamId ? { p_team_id: o.teamId } : {}),
    ...(o.clubId ? { p_club_id: o.clubId } : {}),
    p_include_archived: includeArchived,
  });
  return error ? fail(error) : ok(data ?? []);
}
export async function createDocumentRecord(
  c: Client,
  o: Owner,
  d: {
    title: string;
    description?: string;
    category: string;
    visibility: string;
    pinned: boolean;
    path: string;
    mime: string;
    size: number;
  },
) {
  const { data, error } = await c.rpc('create_document', {
    ...(o.teamId ? { p_team_id: o.teamId } : {}),
    ...(o.clubId ? { p_club_id: o.clubId } : {}),
    p_title: d.title,
    p_description: d.description ?? '',
    p_category: d.category,
    p_visibility: d.visibility,
    p_pinned: d.pinned,
    p_storage_path: d.path,
    p_mime_type: d.mime,
    p_size_bytes: d.size,
  });
  return error ? fail<string>(error) : ok(data);
}
export async function archiveDocument(c: Client, id: string) {
  const { error } = await c.rpc('archive_document', { p_document_id: id });
  return error ? fail<null>(error) : ok(null);
}
/** Short-lived signed URL (5 minutes); RLS on storage.objects decides whether the caller may read the file. */
export async function signedDocumentUrl(c: Client, path: string): Promise<Result<string>> {
  const { data, error } = await c.storage.from('documents').createSignedUrl(path, 300);
  return error || !data ? fail(error) : ok(data.signedUrl);
}
export async function uploadDocumentFile(
  c: Client,
  path: string,
  file: Blob,
  mime: string,
): Promise<Result<null>> {
  const { error } = await c.storage
    .from('documents')
    .upload(path, file, { contentType: mime, upsert: false });
  return error ? fail(error) : ok(null);
}
