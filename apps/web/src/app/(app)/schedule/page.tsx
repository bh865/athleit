'use client';

import { capabilitiesForPlace } from '@athleit/core';
import Link from 'next/link';
import { Suspense } from 'react';

import { useApp } from '@/components/app/app-provider';
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui';
import { ScheduleView } from '@/components/schedule/schedule-view';

function ScheduleForContext() {
  const { active, contexts, status } = useApp();
  if (status === 'loading' || !active)
    return (
      <>
        <PageHeader title="Schedule" />
        <LoadingSkeleton />
      </>
    );
  if (active.kind === 'family') return <ScheduleView scope={{ kind: 'household' }} />;
  if (active.kind === 'team') {
    const caps = capabilitiesForPlace(contexts, 'team', active.id);
    return (
      <ScheduleView
        subtitle={active.title}
        scope={{
          kind: 'team',
          teamId: active.id,
          sport: active.sport ?? 'soccer',
          canManage: caps.has('schedule.manage'),
        }}
      />
    );
  }
  return (
    <>
      <PageHeader title="Schedule" subtitle={active.title} />
      <EmptyState
        icon="calendar-blank"
        title="Open a team to see its schedule"
        body="Club admins can read the schedule of each linked team."
        action={<Link href={`/clubs/${active.id}`}>Go to {active.title}</Link>}
      />
    </>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ScheduleForContext />
    </Suspense>
  );
}
