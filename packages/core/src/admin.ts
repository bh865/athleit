/**
 * Admin portal rules that are pure data and logic: the module registry, the two role matrices, the edit window,
 * reason validation and the CSV exporter. No React and no I/O so web, tests and docs share one definition.
 * The database is the authority for every permission here; this file only decides what to show.
 */
import { formatCents } from './money';

export type PlatformRole = 'owner' | 'admin' | 'support';
const RANK: Record<PlatformRole, number> = { support: 1, admin: 2, owner: 3 };

export const roleAtLeast = (role: PlatformRole | null | undefined, min: PlatformRole): boolean =>
  role != null && RANK[role] >= RANK[min];

export const isPlatformRole = (v: unknown): v is PlatformRole =>
  v === 'owner' || v === 'admin' || v === 'support';

// Module registry -----------------------------------------------------------------------------------------------
export type AdminNavGroup =
  | 'Overview'
  | 'Customers'
  | 'Money'
  | 'Trust and safety'
  | 'Support'
  | 'Platform'
  | 'Audit'
  | 'Admins';
export type AdminPageType =
  | 'Report'
  | 'List + detail'
  | 'Search + detail'
  | 'Queue + list'
  | 'Report + list'
  | 'Queue'
  | 'List'
  | 'Settings group'
  | 'List + diff';

export interface AdminModule {
  key: string;
  label: string;
  /** Phosphor icon name (kebab case); the web app maps it to a component. */
  icon: string;
  route: string;
  minRole: PlatformRole;
  group: AdminNavGroup;
  pageType: AdminPageType;
  /** Shown on phones (under 834px): Overview, Search and the queues, read-only. */
  phone: boolean;
}

/** One row per module. The navigation, route guards, command palette and the small-screen state all read this. */
export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'squares-four',
    route: '/admin',
    minRole: 'support',
    group: 'Overview',
    pageType: 'Report',
    phone: true,
  },
  {
    key: 'teams',
    label: 'Teams',
    icon: 'users-three',
    route: '/admin/teams',
    minRole: 'support',
    group: 'Customers',
    pageType: 'List + detail',
    phone: false,
  },
  {
    key: 'clubs',
    label: 'Clubs',
    icon: 'buildings',
    route: '/admin/clubs',
    minRole: 'support',
    group: 'Customers',
    pageType: 'List + detail',
    phone: false,
  },
  {
    key: 'people',
    label: 'People',
    icon: 'user-circle',
    route: '/admin/people',
    minRole: 'support',
    group: 'Customers',
    pageType: 'Search + detail',
    phone: true,
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    icon: 'arrows-clockwise',
    route: '/admin/subscriptions',
    minRole: 'support',
    group: 'Money',
    pageType: 'Queue + list',
    phone: true,
  },
  {
    key: 'payments',
    label: 'Payments and fees',
    icon: 'credit-card',
    route: '/admin/payments',
    minRole: 'admin',
    group: 'Money',
    pageType: 'Report',
    phone: false,
  },
  {
    key: 'connect',
    label: 'Connect accounts',
    icon: 'bank',
    route: '/admin/connect',
    minRole: 'admin',
    group: 'Money',
    pageType: 'Report + list',
    phone: false,
  },
  {
    key: 'disputes',
    label: 'Disputes and refunds',
    icon: 'receipt-x',
    route: '/admin/disputes',
    minRole: 'admin',
    group: 'Money',
    pageType: 'Queue',
    phone: true,
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'flag',
    route: '/admin/reports',
    minRole: 'support',
    group: 'Trust and safety',
    pageType: 'Queue',
    phone: true,
  },
  {
    key: 'support-tickets',
    label: 'Tickets',
    icon: 'tray',
    route: '/admin/support/tickets',
    minRole: 'support',
    group: 'Support',
    pageType: 'Queue',
    phone: false,
  },
  {
    key: 'support-feedback',
    label: 'Feedback',
    icon: 'chat-circle',
    route: '/admin/support/feedback',
    minRole: 'support',
    group: 'Support',
    pageType: 'List',
    phone: false,
  },
  {
    key: 'support-articles',
    label: 'Articles',
    icon: 'question',
    route: '/admin/support/articles',
    minRole: 'support',
    group: 'Support',
    pageType: 'Report + list',
    phone: false,
  },
  {
    key: 'support-reports',
    label: 'Support reports',
    icon: 'clipboard-text',
    route: '/admin/support/reports',
    minRole: 'support',
    group: 'Support',
    pageType: 'Report',
    phone: false,
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'bell-ringing',
    route: '/admin/notifications',
    minRole: 'admin',
    group: 'Platform',
    pageType: 'Report',
    phone: false,
  },
  {
    key: 'jobs',
    label: 'Jobs and webhooks',
    icon: 'gear-six',
    route: '/admin/jobs',
    minRole: 'admin',
    group: 'Platform',
    pageType: 'List',
    phone: false,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'sliders-horizontal',
    route: '/admin/settings',
    minRole: 'admin',
    group: 'Platform',
    pageType: 'Settings group',
    phone: false,
  },
  {
    key: 'audit',
    label: 'Audit',
    icon: 'clipboard-text',
    route: '/admin/audit',
    minRole: 'support',
    group: 'Audit',
    pageType: 'List + diff',
    phone: false,
  },
  {
    key: 'admins',
    label: 'Admins',
    icon: 'shield-check',
    route: '/admin/admins',
    minRole: 'owner',
    group: 'Admins',
    pageType: 'List',
    phone: false,
  },
];

export const modulesFor = (role: PlatformRole | null | undefined): AdminModule[] =>
  ADMIN_MODULES.filter((m) => roleAtLeast(role, m.minRole));

/** The module that owns a pathname (longest matching route), or null. */
export function moduleForPath(pathname: string): AdminModule | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  let best: AdminModule | null = null;
  for (const m of ADMIN_MODULES) {
    const hit =
      m.route === '/admin'
        ? clean === '/admin'
        : clean === m.route || clean.startsWith(m.route + '/');
    if (hit && (!best || m.route.length > best.route.length)) best = m;
  }
  return best;
}

export const canViewPath = (role: PlatformRole | null | undefined, pathname: string): boolean => {
  const m = moduleForPath(pathname);
  return m != null && roleAtLeast(role, m.minRole);
};

export const NAV_GROUP_ORDER: readonly AdminNavGroup[] = [
  'Overview',
  'Customers',
  'Money',
  'Trust and safety',
  'Support',
  'Platform',
  'Audit',
  'Admins',
];
export function navGroups(
  role: PlatformRole | null | undefined,
): { group: AdminNavGroup; items: AdminModule[] }[] {
  const mods = modulesFor(role);
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: mods.filter((m) => m.group === group),
  })).filter((g) => g.items.length > 0);
}

// Who can do what (writes need MFA and a reason) -----------------------------------------------------------------
export type AdminAction =
  | 'extend_trial'
  | 'comp_team'
  | 'clear_comp'
  | 'change_commercial_setting'
  | 'toggle_team_billing'
  | 'change_automatic_tax'
  | 'change_fee_config'
  | 'manage_admins'
  | 'review_report'
  | 'reveal_message'
  | 'edit_sport_config'
  | 'add_note'
  | 'support_reply'
  | 'support_merge'
  | 'support_spam'
  | 'support_redact'
  | 'support_delete_attachment'
  | 'support_export'
  | 'support_manage_canned'
  | 'support_feedback_status';

const ACTION_MIN: Record<AdminAction, PlatformRole> = {
  extend_trial: 'admin',
  comp_team: 'admin',
  clear_comp: 'admin',
  change_commercial_setting: 'admin',
  toggle_team_billing: 'owner',
  change_automatic_tax: 'owner',
  change_fee_config: 'owner',
  manage_admins: 'owner',
  review_report: 'support',
  reveal_message: 'admin',
  edit_sport_config: 'admin',
  add_note: 'support',
  support_reply: 'support',
  support_merge: 'admin',
  support_spam: 'admin',
  support_redact: 'admin',
  support_delete_attachment: 'admin',
  support_export: 'admin',
  support_manage_canned: 'admin',
  support_feedback_status: 'admin',
};
export const canDo = (role: PlatformRole | null | undefined, action: AdminAction): boolean =>
  roleAtLeast(role, ACTION_MIN[action]);
/** The role a locked control tells the user they need. */
export const roleNeededFor = (action: AdminAction): PlatformRole => ACTION_MIN[action];
/** Whether a setting definition's write role lets this role edit it. */
export const canWriteSetting = (
  role: PlatformRole | null | undefined,
  writeRole: 'owner' | 'admin',
): boolean => roleAtLeast(role, writeRole);

// Money-bearing screens hide from support entirely.
export const canSeeMoney = (role: PlatformRole | null | undefined): boolean =>
  roleAtLeast(role, 'admin');

// Reason ---------------------------------------------------------------------------------------------------------
export const REASON_MIN_LENGTH = 10;
export const REASON_TOO_SHORT =
  'Add a reason of at least 10 characters. It is saved to the audit log.';
export const isReasonValid = (reason: string): boolean => reason.trim().length >= REASON_MIN_LENGTH;

// Edit window ------------------------------------------------------------------------------------------------------
/** How long after a successful MFA verification the portal stays in editing mode (a convenience; the database checks aal2). */
export const EDIT_WINDOW_MINUTES = 15;
/** Seconds left in the editing window, given the unix timestamp (seconds) of the last TOTP verification. 0 = read-only. */
export function editSecondsLeft(
  verifiedAtUnix: number | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!verifiedAtUnix) return 0;
  const end = verifiedAtUnix * 1000 + EDIT_WINDOW_MINUTES * 60_000;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// CSV (generated from the same rows as "View as table", client side) ----------------------------------------------------
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Render as dollars with formatCents (the value is integer cents). */
  cents?: boolean;
}
const csvCell = (v: string): string => {
  // Neutralise spreadsheet formulas, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** A header row, the data rows, then an "As of" line so an exported file says when it was true. */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  asOf: string,
): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) =>
    columns
      .map((c) => {
        const v = c.value(r);
        if (v == null) return '';
        return csvCell(c.cents && typeof v === 'number' ? formatCents(v) : String(v));
      })
      .join(','),
  );
  return [head, ...body, csvCell(`As of ${asOf}`)].join('\r\n') + '\r\n';
}
