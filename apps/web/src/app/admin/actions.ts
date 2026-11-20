'use server';

import {
  addAdmin,
  addSupportNote,
  clearComp,
  compTeam,
  disableTeamBilling,
  enableTeamBilling,
  enableTeamBillingImpact,
  extendTrial,
  feeConfigImpact,
  lookup,
  removeAdmin,
  reviewMessageReport,
  revealReportedMessage,
  setAdminRole,
  setFeeConfig,
  setSetting,
  setSportConfig,
} from '@athleit/db/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAdminAction, type ActionResult } from '@/lib/admin/action';

/**
 * Every admin write. Each re-checks the caller's role (runAdminAction) and then calls the public admin_* function with
 * the caller's own session: the database enforces role, aal2 and the 10 character reason. Inputs are validated here
 * so a malformed call gets a typed error instead of a database one. Typed errors are returned, never swallowed.
 */
const uuid = z.string().uuid();
const reason = z.string().max(500);
const bad: ActionResult<never> = {
  ok: false,
  code: 'unknown',
  message: 'That request wasn’t valid.',
};

export async function setSettingAction(
  key: string,
  value: unknown,
  why: string,
): Promise<ActionResult> {
  if (!z.string().min(1).max(100).safeParse(key).success || !reason.safeParse(why).success)
    return bad;
  const r = await runAdminAction('support', (c) => setSetting(c, key, value, why)); // the database applies the key's write role
  revalidatePath('/admin/settings');
  return r;
}

export async function extendTrialAction(
  teamId: string,
  newEnd: string,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(teamId).success ||
    Number.isNaN(Date.parse(newEnd)) ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('admin', (c) =>
    extendTrial(c, teamId, new Date(newEnd).toISOString(), why),
  );
  revalidatePath('/admin/teams');
  return r;
}

export async function compTeamAction(
  teamId: string,
  until: string | null,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(teamId).success ||
    (until !== null && Number.isNaN(Date.parse(until))) ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('admin', (c) =>
    compTeam(c, teamId, until === null ? null : new Date(until).toISOString(), why),
  );
  revalidatePath('/admin/teams');
  return r;
}

export async function clearCompAction(teamId: string, why: string): Promise<ActionResult> {
  if (!uuid.safeParse(teamId).success || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('admin', (c) => clearComp(c, teamId, why));
  revalidatePath('/admin/teams');
  return r;
}

const fee = z.object({
  flatCents: z.number().int().min(0).max(10000),
  bps: z.number().int().min(0).max(2000),
  stripeBps: z.number().int().min(0).max(1000),
  stripeFixedCents: z.number().int().min(0).max(100),
  refundChargeFull: z.boolean(),
  refundChargePartial: z.boolean(),
  refundServiceFull: z.boolean(),
  refundServicePartial: z.boolean(),
});
export async function setFeeConfigAction(
  input: z.infer<typeof fee>,
  why: string,
): Promise<ActionResult<string>> {
  const p = fee.safeParse(input);
  if (!p.success || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('owner', (c) => setFeeConfig(c, p.data, why));
  revalidatePath('/admin/payments');
  return r;
}
export async function feeImpactAction(flatCents: number, bps: number) {
  if (!Number.isInteger(flatCents) || !Number.isInteger(bps)) return bad;
  return runAdminAction('owner', (c) => feeConfigImpact(c, flatCents, bps));
}

export async function enableTeamBillingAction(why: string): Promise<ActionResult<number>> {
  if (!reason.safeParse(why).success) return bad;
  const r = await runAdminAction('owner', (c) => enableTeamBilling(c, why));
  revalidatePath('/admin', 'layout');
  return r;
}
export async function disableTeamBillingAction(why: string): Promise<ActionResult> {
  if (!reason.safeParse(why).success) return bad;
  const r = await runAdminAction('owner', (c) => disableTeamBilling(c, why));
  revalidatePath('/admin', 'layout');
  return r;
}
export async function enableImpactAction() {
  return runAdminAction('owner', (c) => enableTeamBillingImpact(c));
}

const sport = z.object({
  sport: z.string().min(1).max(30),
  periodType: z.string().min(1).max(20),
  periodCount: z.number().int().min(1).max(12),
  periodMinutes: z.number().int().min(1).max(120).nullable(),
  tiesAllowed: z.boolean(),
  positions: z.array(z.string().max(30)).max(40),
  scoringLabel: z.string().min(1).max(30),
});
export async function setSportConfigAction(
  input: z.infer<typeof sport>,
  why: string,
): Promise<ActionResult> {
  const p = sport.safeParse(input);
  if (!p.success || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('admin', (c) => setSportConfig(c, p.data, why));
  revalidatePath('/admin/settings');
  return r;
}

export async function reviewReportAction(
  reportId: string,
  action: 'action' | 'dismiss',
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(reportId).success ||
    !['action', 'dismiss'].includes(action) ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('support', (c) => reviewMessageReport(c, reportId, action, why));
  revalidatePath('/admin/reports');
  return r;
}
/** The only way a message body reaches the portal. The database audits it with actor, report and reason. */
export async function revealReportAction(reportId: string, why: string) {
  if (!uuid.safeParse(reportId).success || !reason.safeParse(why).success) return bad;
  return runAdminAction('admin', (c) => revealReportedMessage(c, reportId, why));
}

const role = z.enum(['owner', 'admin', 'support']);
export async function addAdminAction(email: string, r: string, why: string): Promise<ActionResult> {
  if (
    !z.string().email().max(200).safeParse(email).success ||
    !role.safeParse(r).success ||
    !reason.safeParse(why).success
  )
    return bad;
  const out = await runAdminAction('owner', (c) => addAdmin(c, email, role.parse(r), why));
  revalidatePath('/admin/admins');
  return out;
}
export async function setAdminRoleAction(
  profileId: string,
  r: string,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(profileId).success ||
    !role.safeParse(r).success ||
    !reason.safeParse(why).success
  )
    return bad;
  const out = await runAdminAction('owner', (c) => setAdminRole(c, profileId, role.parse(r), why));
  revalidatePath('/admin/admins');
  return out;
}
export async function removeAdminAction(profileId: string, why: string): Promise<ActionResult> {
  if (!uuid.safeParse(profileId).success || !reason.safeParse(why).success) return bad;
  const out = await runAdminAction('owner', (c) => removeAdmin(c, profileId, why));
  revalidatePath('/admin/admins');
  return out;
}

export async function addNoteAction(
  subjectType: 'team' | 'club' | 'person',
  subjectId: string,
  note: string,
): Promise<ActionResult<number>> {
  if (
    !['team', 'club', 'person'].includes(subjectType) ||
    !uuid.safeParse(subjectId).success ||
    !z.string().min(1).max(2000).safeParse(note).success
  )
    return bad;
  const out = await runAdminAction('support', (c) =>
    addSupportNote(c, subjectType, subjectId, note),
  );
  revalidatePath('/admin', 'layout');
  return out;
}

/** The command palette: typed results for an id, code or name. Money-related types are hidden from support by the database. */
export async function lookupAction(term: string) {
  if (!z.string().min(3).max(100).safeParse(term).success) return bad;
  return runAdminAction('support', (c) => lookup(c, term));
}
