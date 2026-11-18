'use client';

import { Suspense } from 'react';

import { useTeam } from '@/components/app/team-context';
import { LoadingSkeleton } from '@/components/ui';
import { ScheduleView } from '@/components/schedule/schedule-view';

function TeamSchedule() {
  const { team, caps } = useTeam();
  return (
    <ScheduleView
      embedded
      scope={{
        kind: 'team',
        teamId: team.id,
        sport: team.sport,
        canManage: caps.has('schedule.manage'),
      }}
    />
  );
}

export default function TeamSchedulePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TeamSchedule />
    </Suspense>
  );
}
