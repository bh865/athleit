import { RSVP_LABELS, friendlyError, rsvpChipLabel, type RsvpStatus } from '@athleit/core';
import { setRsvp } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Icon, Text, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';

import type { ScheduleItem } from './items';

type Child = NonNullable<ScheduleItem['children']>[number];
const ICON = { going: 'check-circle', not_going: 'x-circle', maybe: 'question' } as const;

/**
 * One child on a row: a "Maya: Going" chip (icon and words) and, while the event is open, Going and Can't go
 * quick actions that call the same set_rsvp as the event screen. Optimistic, with Retry.
 */
export function RsvpChipRow({
  eventId,
  child,
  quickActions,
  onChanged,
}: {
  eventId: string;
  child: Child;
  quickActions: boolean;
  onChanged?: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const [status, setStatus] = useState<RsvpStatus | null>(child.status);
  const [seen, setSeen] = useState(child.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; next: RsvpStatus } | null>(null);
  if (seen !== child.status) {
    setSeen(child.status);
    setStatus(child.status);
  }

  async function choose(next: RsvpStatus) {
    const prev = status;
    setStatus(next);
    setError(null);
    setPending(true);
    const res = await setRsvp(supabase, eventId, child.player_id, next);
    setPending(false);
    if (res.error) {
      setStatus(prev);
      setError({ message: friendlyError(res.error), next });
    } else onChanged?.();
  }

  return (
    <View style={{ gap: space[2] }} testID="rsvp-controls">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        <View
          accessible
          accessibilityLabel={rsvpChipLabel(child.first_name, status)}
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            paddingVertical: space[1],
            paddingHorizontal: space[3],
            borderRadius: componentTokens.chip.radius,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Icon
            name={status ? ICON[status] : 'circle-dashed'}
            weight={status ? 'fill' : 'regular'}
            size="sm"
            color={status ? c.ink : c.muted}
          />
          <Text variant="caption" muted={!status}>
            {child.first_name}: {status ? RSVP_LABELS[status] : 'No reply'}
          </Text>
        </View>
        {quickActions ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button
              title="Going"
              variant={status === 'going' ? 'primary' : 'secondary'}
              accessibilityLabel={`${child.first_name}: Going`}
              accessibilityState={{ selected: status === 'going' }}
              disabled={pending}
              onPress={() => choose('going')}
              style={{ minHeight: componentTokens.minTarget, borderRadius: radius.pill }}
            />
            <Button
              title="Can’t go"
              variant={status === 'not_going' ? 'primary' : 'secondary'}
              accessibilityLabel={`${child.first_name}: Can’t go`}
              accessibilityState={{ selected: status === 'not_going' }}
              disabled={pending}
              onPress={() => choose('not_going')}
              style={{ minHeight: componentTokens.minTarget, borderRadius: radius.pill }}
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }} accessibilityRole="alert">
          <Text variant="caption" style={{ color: c.bad, flex: 1 }}>
            {error.message}
          </Text>
          <Button title="Retry" variant="secondary" onPress={() => choose(error.next)} />
        </View>
      ) : null}
    </View>
  );
}
