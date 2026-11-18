'use client';

import { getRegistrationEvent } from '@athleit/db/registration';
import { useParams } from 'next/navigation';

import { LoadState } from '@/components/app/states';
import { EventBuilder } from '@/components/registration/event-builder';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function EditRegistrationPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const ev = useLoad(() => getRegistrationEvent(getClient(), eventId), [eventId]);
  const owner = ev.data?.team_id ? { teamId: ev.data.team_id } : { clubId: ev.data?.club_id ?? '' };
  return (
    <LoadState loading={ev.loading} error={ev.error} onRetry={ev.reload}>
      {ev.data ? <EventBuilder eventId={eventId} owner={owner} /> : null}
    </LoadState>
  );
}
