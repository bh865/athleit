'use client';

import { teamForScreen } from '@athleit/core';

import { useApp } from '@/components/app/app-provider';
import { TeamProvider } from '@/components/app/team-context';
import { RosterView } from '@/components/roster/roster-view';
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui';

/**
 * Roster for the active team. Everyone linked to the team can open it: staff get the full roster
 * (status, contacts, edit, placement), parents and players the limited list. The database decides
 * what each person can read; RosterView only shows what the capabilities allow.
 */
export default function RosterPage() {
  const { active, contexts, status } = useApp();
  const team = teamForScreen(contexts, active);
  if (status === 'loading') return <LoadingSkeleton />;
  return (
    <>
      <PageHeader title="Roster" subtitle={team?.title} />
      {team ? (
        <TeamProvider teamId={team.id}>
          <RosterView />
        </TeamProvider>
      ) : (
        <EmptyState
          icon="users-three"
          title="No team yet"
          body="Join or create a team to see its roster."
        />
      )}
    </>
  );
}
