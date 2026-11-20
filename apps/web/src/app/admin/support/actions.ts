'use server';

import {
  adminAssignSupport,
  adminDeleteSupportAttachment,
  adminExportSupport,
  adminLinkSupportArticle,
  adminMarkSupportSpam,
  adminMergeSupport,
  adminRedactSupportMessage,
  adminReleaseSupportHold,
  adminReplySupport,
  adminSetFeedbackStatus,
  adminSetSupportPriority,
  adminSetSupportStatus,
  adminSignSupportAttachment,
  adminTagSupport,
} from '@athleit/db/support';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAdminAction, type ActionResult } from '@/lib/admin/action';

/**
 * Support writes. Routine work (reply, note, assign, status, priority, tags, link, release) needs the support role and no
 * MFA or reason; it is recorded on the ticket's activity. Merge, spam, redact, delete attachment, export and feedback status
 * need the admin role, an MFA session and a reason: the database enforces all of that, this file only validates input.
 */
const uuid = z.string().uuid();
const bad: ActionResult<never> = {
  ok: false,
  code: 'unknown',
  message: 'That request wasn’t valid.',
};
const reason = z.string().max(500);
const refresh = (id?: string) => {
  revalidatePath('/admin/support/tickets');
  if (id) revalidatePath(`/admin/support/tickets/${id}`);
};

export async function replyAction(
  id: string,
  body: string,
  internal: boolean,
  status: 'open' | 'waiting_on_requester' | 'solved' | null,
): Promise<ActionResult<string>> {
  if (!uuid.safeParse(id).success || !body.trim() || body.length > 5000) return bad;
  const r = await runAdminAction('support', (c) =>
    adminReplySupport(c, id, body, { internal, status }),
  );
  refresh(id);
  return r;
}
export async function assignAction(id: string, assignee: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (assignee !== null && !uuid.safeParse(assignee).success))
    return bad;
  const r = await runAdminAction('support', (c) => adminAssignSupport(c, id, assignee));
  refresh(id);
  return r;
}
export async function statusAction(
  id: string,
  status: 'open' | 'waiting_on_requester' | 'solved' | 'closed',
): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return bad;
  const r = await runAdminAction('support', (c) => adminSetSupportStatus(c, id, status));
  refresh(id);
  return r;
}
export async function priorityAction(
  id: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return bad;
  const r = await runAdminAction('support', (c) => adminSetSupportPriority(c, id, priority));
  refresh(id);
  return r;
}
export async function tagAction(id: string, tags: string[]): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || tags.length > 20) return bad;
  const r = await runAdminAction('support', (c) => adminTagSupport(c, id, tags));
  refresh(id);
  return r;
}
export async function linkArticleAction(id: string, slug: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (slug !== null && !/^[a-z0-9-]{1,120}$/.test(slug)))
    return bad;
  const r = await runAdminAction('support', (c) => adminLinkSupportArticle(c, id, slug));
  refresh(id);
  return r;
}
export async function releaseHoldAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return bad;
  const r = await runAdminAction('support', (c) => adminReleaseSupportHold(c, id));
  refresh(id);
  return r;
}

// Sensitive: admin, aal2, reason, audit ------------------------------------------------------------------------------------
export async function mergeAction(
  source: string,
  target: string,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(source).success ||
    !uuid.safeParse(target).success ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('admin', (c) => adminMergeSupport(c, source, target, why));
  refresh(source);
  return r;
}
export async function spamAction(id: string, why: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('admin', (c) => adminMarkSupportSpam(c, id, why));
  refresh(id);
  return r;
}
export async function redactAction(
  ticketId: string,
  messageId: string,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(ticketId).success ||
    !uuid.safeParse(messageId).success ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('admin', (c) => adminRedactSupportMessage(c, messageId, why));
  refresh(ticketId);
  return r;
}
export async function deleteAttachmentAction(
  ticketId: string,
  attachmentId: string,
  why: string,
): Promise<ActionResult> {
  if (
    !uuid.safeParse(ticketId).success ||
    !uuid.safeParse(attachmentId).success ||
    !reason.safeParse(why).success
  )
    return bad;
  const r = await runAdminAction('admin', (c) =>
    adminDeleteSupportAttachment(c, attachmentId, why),
  );
  refresh(ticketId);
  return r;
}
export async function exportAction(
  range: string,
  why: string,
): Promise<ActionResult<Record<string, unknown>[]>> {
  if (!['7d', '30d', '90d', '12m'].includes(range) || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('admin', (c) => adminExportSupport(c, range, why));
  return r.ok ? { ok: true, data: r.data.items } : r;
}
export async function feedbackStatusAction(
  id: string,
  status: 'new' | 'considering' | 'planned' | 'shipped' | 'wont_do',
  why: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !reason.safeParse(why).success) return bad;
  const r = await runAdminAction('admin', (c) => adminSetFeedbackStatus(c, id, status, why));
  revalidatePath('/admin/support/feedback');
  return r;
}
/** A 60 second, download-only URL. The Edge Function re-checks the platform role. */
export async function signAttachmentAction(attachmentId: string): Promise<ActionResult<string>> {
  if (!uuid.safeParse(attachmentId).success) return bad;
  return runAdminAction('support', async (c) => {
    const r = await adminSignSupportAttachment(c, attachmentId);
    return r.error ? r : { data: r.data.url, error: null };
  });
}
