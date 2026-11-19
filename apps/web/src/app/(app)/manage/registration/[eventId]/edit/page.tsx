'use client';

import { REG_STEPS, type RegStep } from '@athleit/core';
import { getRegistrationEvent } from '@athleit/db/registration';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoadState } from '@/components/app/states';
import { RegistrationBuilder } from '@/components/builders/registration-builder';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

function Inner() {
  const { eventId } = useParams<{ eventId: string }>();
  const q = useSearchParams();
  const ev = useLoad(() => getRegistrationEvent(getClient(), eventId), [eventId]);
  const step = q.get('step');
  const owner = ev.data?.team_id ? { teamId: ev.data.team_id } : { clubId: ev.data?.club_id ?? '' };
  return (
    <LoadState loading={ev.loading} error={ev.error} onRetry={ev.reload}>
      {ev.data ? (
        <RegistrationBuilder
          eventId={eventId}
          owner={owner}
          initialStep={
            (REG_STEPS as readonly string[]).includes(step ?? '') ? (step as RegStep) : null
          }
          pickedForm={q.get('form')}
        />
      ) : null}
    </LoadState>
  );
}
export default function EditRegistrationPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
