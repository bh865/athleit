import { legacyTeamTarget, teamTabHref } from '@athleit/core';
import { redirect } from 'next/navigation';

/**
 * Old team URLs keep working: requests, invites and members land on People, compliance on Waivers, and the
 * team schedule on the global Schedule. Anything else falls back to the Overview.
 */
export default async function LegacyTeamPath({
  params,
}: {
  params: Promise<{ id: string; legacy: string[] }>;
}) {
  const { id, legacy } = await params;
  const t = legacyTeamTarget(legacy);
  if (!t) redirect(teamTabHref(id, 'overview'));
  if (t.kind === 'schedule') redirect('/schedule');
  redirect(teamTabHref(id, t.tab, t.view));
}
