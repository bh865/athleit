'use client';

import { TEAM_TABS, visibleTeamTabs, type TeamTab } from '@athleit/core';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import styles from '@/components/app/app.module.css';
import { TeamProvider, useTeam } from '@/components/app/team-context';
import { TabRow } from '@/components/team/tab-row';
import { HeaderSlot, TeamHubProvider, useTeamHub } from '@/components/team/team-hub';
import teamStyles from '@/components/team/team.module.css';
import { Badge, PageHeader } from '@/components/ui';

/** Which tab a path belongs to. Anything that is not a tab (e.g. a legacy redirect) is null. */
function tabFor(pathname: string, base: string): TeamTab | null {
  if (pathname === base) return 'overview';
  const seg = pathname.slice(base.length + 1).split('/')[0];
  return (TEAM_TABS as readonly string[]).includes(seg ?? '') ? (seg as TeamTab) : null;
}

function TeamHeader({ active }: { active: TeamTab | null }) {
  const { team, caps } = useTeam();
  const hub = useTeamHub();
  const tabs = visibleTeamTabs(caps);
  return (
    <>
      <PageHeader
        title={team.name}
        subtitle={
          <>
            <span className={styles.capitalize}>{team.sport}</span> · {team.season_label}
            {!caps.has('roster.edit') && caps.has('roster.viewFull') && (
              <>
                {' '}
                <Badge>Read only</Badge>
              </>
            )}
          </>
        }
        actions={<HeaderSlot className={teamStyles.slot} />}
      />
      <TabRow teamId={team.id} tabs={tabs} active={active ?? 'overview'} counts={hub.counts} />
    </>
  );
}

/**
 * The team details area is for staff (and the linked club admin, read-only). Everyone else already has
 * Roster, Schedule, Messages and Pay in the main navigation, so they are sent home. The one exception is
 * the Documents shelf: parents and players reach it from Home and have nowhere else to open it.
 */
function TeamGate({ children }: { children: ReactNode }) {
  const { team, caps } = useTeam();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/teams/${team.id}`;
  const staff = caps.has('team.details');
  const documentsOnly = !staff && caps.has('documents.view') && pathname === `${base}/documents`;
  const active = tabFor(pathname, base);
  // A staff member who cannot see a tab (e.g. no payments access) is sent to the Overview, never a dead end.
  const hidden = staff && active !== null && !visibleTeamTabs(caps).includes(active);
  const allowed = (staff && !hidden) || documentsOnly;
  useEffect(() => {
    if (hidden) router.replace(base);
    else if (!allowed) router.replace('/');
  }, [allowed, hidden, base, router]);
  if (!allowed) return null;
  if (!staff) return <>{children}</>;
  return (
    <TeamHubProvider>
      <TeamHeader active={active} />
      {children}
    </TeamHubProvider>
  );
}

export default function TeamLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <TeamProvider teamId={id}>
      <TeamGate>{children}</TeamGate>
    </TeamProvider>
  );
}
