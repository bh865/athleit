import { RSVP_LABELS, friendlyError, type RsvpStatus } from '@athleit/core';
import { setRsvp } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Notice } from '@/components/app/kit';
import { Button, Chip, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export interface ChildRsvp {
  player_id: string;
  first_name: string;
  status: RsvpStatus | null;
}

/**
 * Going / Can't go for the viewer's children: child chips when there are several, then the
 * 64px pills. Optimistic with a Retry; the current state is announced to screen readers.
 */
export function RsvpActions({
  eventId,
  kids,
  onChanged,
  compact,
}: {
  eventId: string;
  kids: ChildRsvp[];
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(kids[0]?.player_id ?? '');
  const [local, setLocal] = useState<Record<string, RsvpStatus | null>>({});
  const [error, setError] = useState<{ message: string; next: RsvpStatus } | null>(null);
  const [pending, setPending] = useState(false);
  const child = kids.find((k) => k.player_id === selected) ?? kids[0];
  if (!child) return null;
  const status = local[child.player_id] !== undefined ? local[child.player_id] : child.status;
  const height = compact ? componentTokens.schedule.rsvpButton : componentTokens.schedule.rsvpButtonLg;

  async function choose(next: RsvpStatus) {
    if (!child) return;
    const prev = status;
    setLocal((l) => ({ ...l, [child.player_id]: next }));
    setError(null);
    setPending(true);
    const res = await setRsvp(supabase, eventId, child.player_id, next);
    setPending(false);
    if (res.error) {
      setLocal((l) => ({ ...l, [child.player_id]: prev ?? null }));
      setError({ message: friendlyError(res.error), next });
    } else onChanged?.();
  }

  return (
    <View style={{ gap: space[3] }} testID="rsvp-actions">
      {kids.length > 1 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Child" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {kids.map((k) => (
            <Chip key={k.player_id} label={k.first_name} selected={k.player_id === child.player_id} accessibilityRole="radio" onPress={() => setSelected(k.player_id)} />
          ))}
        </View>
      ) : null}
      <Text variant="caption" muted accessibilityLiveRegion="polite">
        {child.first_name}: {status ? RSVP_LABELS[status] : 'No reply yet'}
      </Text>
      <View style={{ flexDirection: compact ? 'row' : 'column', gap: space[3] }}>
        <View style={{ flex: compact ? 1 : undefined }}>
          <Button
            title="Going"
            icon="check-circle"
            variant={status === 'going' ? 'primary' : 'secondary'}
            accessibilityState={{ selected: status === 'going' }}
            disabled={pending}
            onPress={() => choose('going')}
            style={{ minHeight: height, borderRadius: radius.pill }}
            testID="rsvp-going"
          />
        </View>
        <View style={{ flex: compact ? 1 : undefined }}>
          <Button
            title="Can’t go"
            variant={status === 'not_going' ? 'primary' : 'secondary'}
            accessibilityState={{ selected: status === 'not_going' }}
            disabled={pending}
            onPress={() => choose('not_going')}
            style={{ minHeight: height, borderRadius: radius.pill }}
            testID="rsvp-not-going"
          />
        </View>
      </View>
      <Button title={status === 'maybe' ? 'Maybe (selected)' : 'Maybe'} variant="ghost" disabled={pending} onPress={() => choose('maybe')} />
      {error ? (
        <View style={{ gap: space[2] }}>
          <Notice tone="error">{error.message}</Notice>
          <Button title="Retry" variant="secondary" onPress={() => choose(error.next)} />
        </View>
      ) : null}
    </View>
  );
}
