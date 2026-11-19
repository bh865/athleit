import { registrationPriceLabel } from './registration';
import { registrationEventDataSchema } from './schemas/registration';

/**
 * Model behind the registration builder: one draft object holds every step, so steps can be visited in any
 * order. Validation is per step (for the step rail) and combined for publish gating. Pure, so it is unit-tested.
 */

export const REG_STEPS = ['basics', 'pricing', 'dates', 'form', 'review'] as const;
export type RegStep = (typeof REG_STEPS)[number];

export const REG_STEP_LABEL: Record<RegStep, string> = {
  basics: 'Basics',
  pricing: 'Pricing & capacity',
  dates: 'Dates',
  form: 'Form & waivers',
  review: 'Review',
};

export interface RegDraft {
  title: string;
  kind: string;
  sport: string;
  summary: string;
  locationText: string;
  targetTeamId: string;
  /** Propose a roster spot on the team for players you accept. Needs a team. */
  placeOnRoster: boolean;
  contactEmail: string;
  visibility: 'public' | 'link_only' | 'members_only';
  /** Whole years; empty means no limit. */
  ageMin: string;
  ageMax: string;
  /** Dollars as typed, e.g. "120" or "120.00"; empty means free. */
  price: string;
  paymentTiming: 'none' | 'at_submission' | 'after_acceptance';
  /** Payment plans: the sizes families may choose (1 = pay in full) and how the payments are spaced. */
  planOptions: number[];
  planCadence: 'weekly' | 'biweekly' | 'monthly';
  /** Staff may require the full balance before the event starts (needs a start date). */
  requireFullBalance: 'none' | 'event_start';
  capacity: string;
  waitlist: boolean;
  autoPromote: boolean;
  /** Local date and time, `YYYY-MM-DDTHH:mm`, or empty. */
  opensAt: string;
  closesAt: string;
  /** `YYYY-MM-DD` or empty. */
  startsOn: string;
  endsOn: string;
  /** The chosen form (its latest published version is used) and waivers. */
  formId: string;
  waiverIds: string[];
}

export const emptyDraft = (): RegDraft => ({
  title: '',
  kind: 'season',
  sport: '',
  summary: '',
  locationText: '',
  targetTeamId: '',
  placeOnRoster: false,
  contactEmail: '',
  visibility: 'link_only',
  ageMin: '',
  ageMax: '',
  price: '',
  paymentTiming: 'none',
  planOptions: [1],
  planCadence: 'monthly',
  requireFullBalance: 'none',
  capacity: '',
  waitlist: true,
  autoPromote: false,
  opensAt: '',
  closesAt: '',
  startsOn: '',
  endsOn: '',
  formId: '',
  waiverIds: [],
});

// ---------------------------------------------------------------------------------------------- conversions
const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant to the local `YYYY-MM-DDTHH:mm` an input shows. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Local input value to an ISO instant. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "120", "120.5" or "$120.00" to cents. `null` for empty, `NaN` when it is not an amount. */
export function dollarsToCents(v: string): number | null {
  const t = v.trim().replace(/^\$/, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}
export const centsToDollars = (c: number | null | undefined): string =>
  c ? (c / 100).toFixed(2) : '';

const intOrNull = (v: string): number | null => {
  const t = v.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

interface EventRow {
  title: string;
  kind: string;
  sport: string | null;
  summary: string | null;
  location_text: string | null;
  target_team_id: string | null;
  roster_behavior?: string;
  contact_email: string | null;
  visibility: string;
  eligibility: unknown;
  price_cents: number | null;
  payment_timing: string;
  plan_options?: number[];
  plan_cadence?: string;
  require_full_balance?: string;
  capacity: number | null;
  waitlist_enabled: boolean;
  auto_promote_waitlist: boolean;
  opens_at: string | null;
  closes_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

/** Event row to the draft. `formId` and `waiverIds` come from resolving the stored version ids. */
export function eventToDraft(e: EventRow, formId = '', waiverIds: string[] = []): RegDraft {
  const el = e.eligibility as { type?: string; min?: number; max?: number } | null;
  const age = el?.type === 'age' ? el : null;
  return {
    title: e.title,
    kind: e.kind,
    sport: e.sport ?? '',
    summary: e.summary ?? '',
    locationText: e.location_text ?? '',
    targetTeamId: e.target_team_id ?? '',
    placeOnRoster: e.roster_behavior === 'propose_placement',
    contactEmail: e.contact_email ?? '',
    visibility: (['public', 'link_only', 'members_only'].includes(e.visibility)
      ? e.visibility
      : 'link_only') as RegDraft['visibility'],
    ageMin: age?.min !== undefined ? String(age.min) : '',
    ageMax: age?.max !== undefined ? String(age.max) : '',
    price: centsToDollars(e.price_cents),
    paymentTiming: (e.payment_timing as RegDraft['paymentTiming']) ?? 'none',
    planOptions: e.plan_options?.length ? [...e.plan_options] : [1],
    planCadence: (e.plan_cadence as RegDraft['planCadence']) ?? 'monthly',
    requireFullBalance: (e.require_full_balance as RegDraft['requireFullBalance']) ?? 'none',
    capacity: e.capacity ? String(e.capacity) : '',
    waitlist: e.waitlist_enabled,
    autoPromote: e.auto_promote_waitlist,
    opensAt: toLocalInput(e.opens_at),
    closesAt: toLocalInput(e.closes_at),
    startsOn: e.starts_on ?? '',
    endsOn: e.ends_on ?? '',
    formId,
    waiverIds,
  };
}

/** The payload for create/update_registration_event. Ids that need a lookup are passed in. */
export function draftToEventData(
  d: RegDraft,
  extra: {
    slug: string;
    formVersionId: string | null;
    waiverVersionIds: string[];
    /** Existing info blocks, so editing in the builder never deletes what was written before. */
    infoBlocks: unknown;
  },
) {
  const cents = dollarsToCents(d.price);
  const min = intOrNull(d.ageMin);
  const max = intOrNull(d.ageMax);
  return {
    title: d.title.trim(),
    slug: extra.slug,
    kind: d.kind,
    sport: d.sport || null,
    summary: d.summary.trim() || null,
    info_blocks: extra.infoBlocks ?? [],
    starts_on: d.startsOn || null,
    ends_on: d.endsOn || null,
    location_text: d.locationText.trim() || null,
    opens_at: fromLocalInput(d.opensAt),
    closes_at: fromLocalInput(d.closesAt),
    capacity: intOrNull(d.capacity),
    waitlist_enabled: d.waitlist,
    auto_promote_waitlist: d.waitlist && d.autoPromote,
    visibility: d.visibility,
    eligibility:
      min !== null || max !== null
        ? { type: 'age', ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) }
        : null,
    price_cents: cents !== null && !Number.isNaN(cents) && cents > 0 ? cents : null,
    payment_timing: cents && !Number.isNaN(cents) && cents > 0 ? d.paymentTiming : 'none',
    target_team_id: d.targetTeamId || null,
    roster_behavior: d.targetTeamId && d.placeOnRoster ? 'propose_placement' : 'none',
    form_version_id: extra.formVersionId,
    waiver_version_ids: extra.waiverVersionIds,
    contact_email: d.contactEmail.trim() || null,
  };
}

/**
 * Plan terms are saved through their own function (set_registration_event_plan), not update_registration_event, which
 * whitelists the other columns. A free registration keeps the defaults.
 */
export function draftPlanTerms(d: RegDraft): {
  options: number[];
  cadence: RegDraft['planCadence'];
  requireFullBalance: RegDraft['requireFullBalance'];
} {
  const cents = dollarsToCents(d.price);
  const paid = cents !== null && !Number.isNaN(cents) && cents > 0;
  return {
    options: paid ? [...new Set(d.planOptions)].sort((a, b) => a - b) : [1],
    cadence: d.planCadence,
    requireFullBalance: paid ? d.requireFullBalance : 'none',
  };
}

// ------------------------------------------------------------------------------------------------ validation
export interface RegIssue {
  step: RegStep;
  /** Which input, for inline errors. */
  field: string;
  message: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Every problem in the draft. Publishing needs none; saving a draft only needs a title. */
export function regIssues(d: RegDraft): RegIssue[] {
  const out: RegIssue[] = [];
  const add = (step: RegStep, field: string, message: string) => out.push({ step, field, message });

  if (!d.title.trim()) add('basics', 'title', 'Add a name so parents can recognize it.');
  const min = d.ageMin.trim() ? intOrNull(d.ageMin) : null;
  const max = d.ageMax.trim() ? intOrNull(d.ageMax) : null;
  if (d.ageMin.trim() && (min === null || min > 99))
    add('basics', 'ageMin', 'Use a whole number of years.');
  if (d.ageMax.trim() && (max === null || max > 99))
    add('basics', 'ageMax', 'Use a whole number of years.');
  if (min !== null && max !== null && min > max)
    add('basics', 'ageMax', 'The oldest age must be at least the youngest.');
  if (d.contactEmail.trim() && !EMAIL.test(d.contactEmail.trim()))
    add('basics', 'contactEmail', 'Enter a valid email.');

  const cents = dollarsToCents(d.price);
  if (Number.isNaN(cents)) add('pricing', 'price', 'Enter an amount like 120 or 120.50.');
  else if (cents !== null && cents > 0 && cents < 50)
    add('pricing', 'price', 'The fee must be at least $0.50.');
  else if (cents !== null && cents > 5_000_000) add('pricing', 'price', 'That fee is too high.');
  if (cents && !Number.isNaN(cents) && cents > 0 && d.paymentTiming === 'none')
    add('pricing', 'paymentTiming', 'Choose when to collect payment.');
  if (d.requireFullBalance === 'event_start' && !d.startsOn)
    add('pricing', 'requireFullBalance', 'Add the start date first: the balance is due before it.');
  if (
    d.planOptions.some((n) => n < 1 || n > 6 || !Number.isInteger(n)) ||
    d.planOptions.length === 0
  )
    add('pricing', 'planOptions', 'Choose at least one way to pay.');
  if (d.capacity.trim() && (intOrNull(d.capacity) ?? 0) < 1)
    add('pricing', 'capacity', 'Use a whole number of players, at least 1.');

  const o = d.opensAt ? Date.parse(d.opensAt) : null;
  const c = d.closesAt ? Date.parse(d.closesAt) : null;
  if (o !== null && c !== null && c <= o)
    add('dates', 'closesAt', 'The close date is before the open date.');
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn)
    add('dates', 'endsOn', 'The last game is before the first practice.');

  if (!d.formId) add('form', 'formId', 'Add at least one form.');
  return out;
}

export const issuesFor = (issues: readonly RegIssue[], step: RegStep) =>
  issues.filter((i) => i.step === step);

/** What stops a draft from being published, worded for the Review checklist. */
export function publishBlockers(d: RegDraft): string[] {
  return regIssues(d).map((i) => {
    const m = i.message.replace(/\.$/, '');
    return `${REG_STEP_LABEL[i.step]}: ${m.charAt(0).toLowerCase()}${m.slice(1)}`;
  });
}

export type StepState = 'todo' | 'done' | 'error';
/** Rail state: `error` shows only after the step was visited (or on a publish attempt), so a fresh draft is not red. */
export function stepState(
  step: RegStep,
  issues: readonly RegIssue[],
  visited: ReadonlySet<RegStep>,
  showAll = false,
): StepState {
  if (step === 'review') return 'todo';
  const bad = issuesFor(issues, step).length > 0;
  if (bad && (showAll || visited.has(step))) return 'error';
  return visited.has(step) && !bad ? 'done' : 'todo';
}

/** Draft rows that can be sent to the database: the schema check mirrors the server's keys. */
export function eventDataValid(data: unknown): { ok: true } | { ok: false; message: string } {
  const r = registrationEventDataSchema.safeParse(data);
  return r.success
    ? { ok: true }
    : { ok: false, message: r.error.issues[0]?.message ?? 'Check the details.' };
}

// ------------------------------------------------------------------------------------------------- preview
export interface PreviewFacts {
  title: string;
  meta: string;
  fee: string;
  spots: string;
  dates: string;
  forms: string;
  waivers: string;
}

const fmtDay = (v: string) =>
  v
    ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : '';

/** What a parent sees first, from the draft. `formQuestions` and the waiver count come from the chosen form and waivers. */
export function previewFacts(d: RegDraft, formQuestions: number, formName = ''): PreviewFacts {
  const cents = dollarsToCents(d.price);
  const cap = intOrNull(d.capacity);
  const closes = fmtDay(d.closesAt);
  const season = fmtDay(d.startsOn);
  return {
    title: d.title.trim() || 'Untitled registration',
    meta: [
      d.ageMin || d.ageMax ? `Ages ${d.ageMin || '0'}–${d.ageMax || '+'}` : '',
      d.locationText.trim(),
    ]
      .filter(Boolean)
      .join(' · '),
    fee: cents && !Number.isNaN(cents) ? registrationPriceLabel(cents) : 'Free',
    spots: cap ? `${cap} spots` : 'No limit',
    dates: [closes ? `Closes ${closes}` : '', season ? `Season starts ${season}` : '']
      .filter(Boolean)
      .join(' · '),
    forms: d.formId ? `${formName || '1 form'} · ${formQuestions} questions` : 'No form yet',
    waivers: d.waiverIds.length
      ? `${d.waiverIds.length} waiver${d.waiverIds.length === 1 ? '' : 's'} required`
      : 'No waivers',
  };
}
