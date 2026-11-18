import { teamForScreen } from '@athleit/core';

import { AppScreen } from '@/components/app/app-screen';
import { BackLink, H1 } from '@/components/app/kit';
import { RosterSection } from '@/components/team/roster';
import { TeamProvider } from '@/components/team/team-context';
import { EmptyState, LoadingSkeleton, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

/**
 * Roster of the active team (More > Roster). Everyone linked to the team can open it: staff get the
 * full roster, parents and players the limited list (first name, jersey, position). RLS decides.
 */
export default function RosterRoute() {
  const { active, contexts, status } = useApp();
  const team = teamForScreen(contexts, active);
  return (
    <AppScreen>
      <BackLink label="More" />
      <H1>Roster</H1>
      {status === 'loading' ? (
        <LoadingSkeleton />
      ) : team ? (
        <TeamProvider teamId={team.id}>
          <Text muted>{team.title}</Text>
          <RosterSection />
        </TeamProvider>
      ) : (
        <EmptyState
          icon="users-three"
          title="No team yet"
          body="Join or create a team to see its roster."
        />
      )}
    </AppScreen>
  );
}
