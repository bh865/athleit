import { pendingView, type MyJoinRequest } from '@athleit/core';
import { cancelJoinRequest } from '@athleit/db/api';
import { friendlyError } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { Badge, Button, Card, Sheet, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

const TONE = {
  Pending: 'warning',
  Approved: 'success',
  Declined: 'danger',
  Cancelled: 'neutral',
} as const;

const sentOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A request the person sent. It shows only what they supplied (kind, child, date, status); the team or
 * family name appears once approved. Cancel opens a confirm sheet, then the request leaves the
 * approver's list.
 */
export function RequestCard({
  request,
  onChanged,
}: {
  request: MyJoinRequest;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { contexts, setActive, refresh } = useApp();
  const v = pendingView(request);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await cancelJoinRequest(supabase, v.kind, v.requestId);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setConfirm(false);
    onChanged();
  }

  async function open() {
    await refresh();
    const place = contexts.find((c) => c.title === v.placeName);
    if (place) setActive(place.key);
    router.replace('/');
  }

  return (
    <Card style={{ gap: space[3] }} testID={`request-${v.status}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="label" muted>
          {v.kind === 'household' ? 'Family request' : 'Team request'}
        </Text>
        <Badge tone={TONE[v.statusWord]}>{v.statusWord}</Badge>
      </View>
      <Text variant="heading" accessibilityRole="header">
        {v.title}
      </Text>
      <Text variant="caption" muted>
        {v.childFirstName ? `For ${v.childFirstName} · ` : ''}
        {`Sent ${sentOn(request.created_at)}`}
      </Text>
      <Text>{v.body}</Text>
      {v.status === 'pending' ? (
        <Button title="Cancel request" variant="ghost" onPress={() => setConfirm(true)} />
      ) : null}
      {v.status === 'approved' && v.placeName ? (
        <Button title={`Open ${v.placeName}`} onPress={() => void open()} />
      ) : null}
      {v.status === 'declined' ? (
        <Button title="Try again" onPress={() => router.push('/onboarding/code' as never)} />
      ) : null}
      {v.status === 'cancelled' ? (
        <Button
          title="Send a new request"
          onPress={() => router.push('/onboarding/code' as never)}
        />
      ) : null}
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Cancel this request?"
        level="modal"
      >
        <View style={{ gap: space[3] }}>
          <Text>
            The {v.kind === 'household' ? 'family' : 'team'} won’t see it. You can send a new one
            any time.
          </Text>
          <FormMessage error={error} />
          <Button title="Cancel request" loading={busy} onPress={() => void cancel()} />
          <Button title="Keep request" variant="secondary" onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </Card>
  );
}

/** Pending requests, plus (when the person has no place yet) the most recent one that was decided. */
export function RequestCards({
  requests,
  hasPlace,
  onChanged,
}: {
  requests: readonly MyJoinRequest[];
  hasPlace: boolean;
  onChanged: () => void;
}) {
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = hasPlace ? undefined : requests.find((r) => r.status !== 'pending');
  const shown = decided ? [...pending, decided] : pending;
  if (shown.length === 0) return null;
  return (
    <View style={{ gap: space[3] }}>
      {shown.map((r) => (
        <RequestCard key={r.request_id} request={r} onChanged={onChanged} />
      ))}
    </View>
  );
}
