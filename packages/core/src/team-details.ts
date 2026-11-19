import type { Capability } from './capabilities';
import { normalizeWaiverStatus } from './waivers';

/**
 * Team details: seven tabs, in order of use. Visibility is derived from capabilities (never role strings);
 * the database stays the authority. Pure helpers shared by web and mobile.
 */
export const TEAM_TABS = [
  'overview',
  'people',
  'payments',
  'registrations',
  'forms',
  'waivers',
  'documents',
  'settings',
] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

export const TEAM_TAB_LABEL: Record<TeamTab, string> = {
  overview: 'Overview',
  people: 'People',
  payments: 'Payments',
  registrations: 'Registrations',
  forms: 'Forms',
  waivers: 'Waivers',
  documents: 'Documents',
  settings: 'Settings',
};

export const PEOPLE_VIEWS = ['members', 'requests', 'invites'] as const;
export type PeopleView = (typeof PEOPLE_VIEWS)[number];

type Caps = ReadonlySet<Capability>;

/** The seven tabs a person sees. Staff (`team.details`) get the area; each tab then needs its own capability. */
export function visibleTeamTabs(caps: Caps): TeamTab[] {
  if (!caps.has('team.details')) return [];
  const show: Record<TeamTab, boolean> = {
    overview: true,
    people:
      caps.has('members.view') ||
      caps.has('joinRequests.decide') ||
      caps.has('invites.createFamily'),
    payments: caps.has('payments.view'),
    registrations: caps.has('registration.view'),
    forms: caps.has('registration.view'),
    waivers: caps.has('registration.view'),
    documents: caps.has('documents.view'),
    // Coaches and managers read the team's details; only admins (`team.edit`) change them.
    settings: true,
  };
  return TEAM_TABS.filter((t) => show[t]);
}

/** Segments inside People. Members is read-only for coaches; Invites lists family invites for non-admins. */
export function visiblePeopleViews(caps: Caps): PeopleView[] {
  const show: Record<PeopleView, boolean> = {
    members: caps.has('members.view'),
    requests: caps.has('joinRequests.decide'),
    invites: caps.has('invites.createFamily'),
  };
  return PEOPLE_VIEWS.filter((v) => show[v]);
}

/** People opens on Requests when any are pending, otherwise Members (or the first view the person has). */
export function defaultPeopleView(pending: number, views: readonly PeopleView[]): PeopleView {
  if (pending > 0 && views.includes('requests')) return 'requests';
  if (views.includes('members')) return 'members';
  return views[0] ?? 'members';
}

export function parseTeamTab(v: string | null | undefined): TeamTab | null {
  return (TEAM_TABS as readonly string[]).includes(v ?? '') ? (v as TeamTab) : null;
}
export function parsePeopleView(v: string | null | undefined): PeopleView | null {
  return (PEOPLE_VIEWS as readonly string[]).includes(v ?? '') ? (v as PeopleView) : null;
}

/** Web path for a tab. Overview is the index; People keeps its segment in the URL. */
export function teamTabHref(teamId: string, tab: TeamTab, view?: PeopleView | null): string {
  const base = `/teams/${teamId}`;
  if (tab === 'overview') return base;
  if (tab === 'people') return view ? `${base}/people?view=${view}` : `${base}/people`;
  return `${base}/${tab}`;
}

/** Mobile has one team screen; the tab and segment travel as params. */
export function teamTabParams(
  tab: TeamTab,
  view?: PeopleView | null,
): { section: TeamTab; view?: PeopleView } {
  return view && tab === 'people' ? { section: tab, view } : { section: tab };
}

/**
 * Old team URLs keep working. `segments` are the path parts after /teams/:id, e.g. ['requests'].
 * `null` means the segments were not a legacy path at all.
 */
export type LegacyTarget = { kind: 'tab'; tab: TeamTab; view?: PeopleView } | { kind: 'schedule' };
export function legacyTeamTarget(segments: readonly string[]): LegacyTarget | null {
  const [first] = segments;
  switch (first) {
    case 'requests':
      return { kind: 'tab', tab: 'people', view: 'requests' };
    case 'invites':
      return { kind: 'tab', tab: 'people', view: 'invites' };
    case 'members':
      return { kind: 'tab', tab: 'people', view: 'members' };
    case 'compliance':
      return { kind: 'tab', tab: 'waivers' };
    case 'schedule':
      return { kind: 'schedule' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------- long lists

export const PAGE_SIZE = 25;

/** Client-side "Show more": the first `shown` items and how many are left. */
export function pageOf<T>(items: readonly T[], shown: number = PAGE_SIZE) {
  const n = Math.max(PAGE_SIZE, shown);
  return {
    items: items.slice(0, n),
    remaining: Math.max(0, items.length - n),
    total: items.length,
  };
}

// ---------------------------------------------------------------------------------- needs attention

export interface WaiverRowLite {
  player_id: string;
  first_name: string;
  status: string;
}

/**
 * One entry per player, worst status wins (missing > expired > signed). Home counts waiver rows; Team
 * details counts people, so "4 players need a waiver" matches the names we list.
 */
export function waiverPlayers(rows: readonly WaiverRowLite[]) {
  const rank: Record<string, number> = { signed: 0, expired: 1, missing: 2 };
  const by = new Map<string, { player_id: string; first_name: string; status: string }>();
  for (const r of rows) {
    // The database says current / outdated / expired / missing; the screens say signed / expired / missing.
    const status = normalizeWaiverStatus(r.status);
    const cur = by.get(r.player_id);
    if (!cur || (rank[status] ?? 0) > (rank[cur.status] ?? 0))
      by.set(r.player_id, { player_id: r.player_id, first_name: r.first_name, status });
  }
  const players = [...by.values()];
  return {
    players,
    signed: players.filter((p) => p.status === 'signed').length,
    missing: players.filter((p) => p.status === 'missing').length,
    expired: players.filter((p) => p.status === 'expired').length,
    needing: players.filter((p) => p.status !== 'signed'),
  };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** "Priya, Tom and Jordan" (first names only, never last names). More than `max` becomes "+N more". */
export function firstNamesLine(names: readonly string[], max = 3): string {
  const firsts = [...new Set(names.map(firstName).filter(Boolean))];
  if (firsts.length === 0) return '';
  const shown = firsts.slice(0, max);
  const rest = firsts.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} +${rest} more`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

export type TeamAttentionKind = 'joinRequests' | 'waivers' | 'registrations' | 'payments';

export interface TeamAttentionRow {
  kind: TeamAttentionKind;
  tab: TeamTab;
  view?: PeopleView;
  label: string;
  /** First names or an event title: never a last name, medical answer or signed text. */
  detail: string;
  count: number;
}

export interface TeamAttentionInput {
  joinRequests?: readonly { requester_name: string; status: string }[] | undefined;
  waivers?: readonly WaiverRowLite[] | undefined;
  /** Open registration events with submissions waiting for a decision. */
  registrations?: readonly { title: string; toReview: number }[] | undefined;
  /** Payment requests past their due date that still have unpaid families. */
  overduePayments?: readonly { title: string; unpaid: number }[] | undefined;
}

/** What needs a staff member, ordered as the tabs are. Sources a person cannot see are simply left out. */
export function buildTeamAttention(i: TeamAttentionInput): TeamAttentionRow[] {
  const out: TeamAttentionRow[] = [];
  const pending = (i.joinRequests ?? []).filter((r) => r.status === 'pending');
  if (pending.length > 0)
    out.push({
      kind: 'joinRequests',
      tab: 'people',
      view: 'requests',
      label: 'Join requests',
      detail: firstNamesLine(pending.map((r) => r.requester_name)),
      count: pending.length,
    });
  const w = waiverPlayers(i.waivers ?? []);
  if (w.needing.length > 0)
    out.push({
      kind: 'waivers',
      tab: 'waivers',
      label: 'Waivers missing or expired',
      detail: firstNamesLine(
        w.needing.map((p) => p.first_name),
        4,
      ),
      count: w.needing.length,
    });
  const reg = (i.registrations ?? []).filter((r) => r.toReview > 0);
  const toReview = reg.reduce((n, r) => n + r.toReview, 0);
  if (toReview > 0)
    out.push({
      kind: 'registrations',
      tab: 'registrations',
      label: 'Registrations to review',
      detail: reg.length === 1 ? reg[0]!.title : `${reg.length} events`,
      count: toReview,
    });
  const overdue = (i.overduePayments ?? []).filter((p) => p.unpaid > 0);
  if (overdue.length > 0)
    out.push({
      kind: 'payments',
      tab: 'payments',
      label: 'Overdue payments',
      detail: overdue.length === 1 ? overdue[0]!.title : `${overdue.length} requests`,
      count: overdue.length,
    });
  return out;
}

/** Counts shown on the tab pills. Tabs with nothing pending show no badge. */
export function teamTabCounts(rows: readonly TeamAttentionRow[]): Partial<Record<TeamTab, number>> {
  const out: Partial<Record<TeamTab, number>> = {};
  for (const r of rows) out[r.tab] = (out[r.tab] ?? 0) + r.count;
  return out;
}

// ---------------------------------------------------------------------------------- small formatters

/** "today", "yesterday", "3 days ago". Coarse on purpose: lists are for triage, not audit. */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "Nov 12". */
export function shortDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Case-insensitive "contains" across fields; an empty query matches everything. */
export function matchesQuery(q: string, ...fields: (string | null | undefined)[]): boolean {
  const n = q.trim().toLowerCase();
  return !n || fields.some((f) => (f ?? '').toLowerCase().includes(n));
}
