import { describeEventTime } from '@athleit/core';
import { getNextUp } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ListGroup, Text, useTheme } from '@/components/ui';
import { ListItem } from '@/components/app/kit';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { viewerZone } from '@/lib/viewer-zone';

import { RsvpActions, type ChildRsvp } from './rsvp-actions';

/** Home "Next up": kicker with day and time, title, place, Going / Can't go per child (staff see counts). */
export function NextUpCard() {
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const res = useLoad(() => getNextUp(supabase, 4), []);
  const rows = res.data ?? [];
  const [top, ...rest] = rows;
  if (res.loading || res.error || !top) return null;
  const t = describeEventTime(top.starts_at, top.ends_at, top.timezone, viewerZone());
  const kids = (top.children as unknown as ChildRsvp[]) ?? [];
  const place = top.location_name ?? top.location_text;
  return (
    <View style={{ gap: space[4] }} testID="next-up">
      <View
        style={{
          gap: space[2],
          padding: space[6],
          borderRadius: radius.xl,
          borderWidth: componentTokens.card.border,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <Text variant="label" muted>
          NEXT UP · {t.weekdayShort} {t.startLabel}
          {rows.some((r) => r.team_id !== top.team_id) ? ` · ${top.team_name}` : ''}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/events/${top.event_id}`)}>
          <Text variant="heading">{top.title}</Text>
        </Pressable>
        {place ? (
          <Text variant="caption" muted>
            {place}
          </Text>
        ) : null}
        {kids.length > 0 ? <RsvpActions eventId={top.event_id} kids={kids} compact /> : null}
        {top.is_staff ? (
          <View
            style={{ flexDirection: 'row', gap: space[6] }}
            accessibilityLabel={`${top.going} going, ${top.not_going} can’t go, ${top.no_reply} no reply`}
          >
            {[
              { v: top.going, l: 'Going' },
              { v: top.not_going, l: 'Can’t go' },
              { v: top.no_reply, l: 'No reply' },
            ].map((x) => (
              <View key={x.l}>
                <Text variant="mono">{x.v}</Text>
                <Text variant="caption" muted>
                  {x.l}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {rest.length > 0 ? (
        <ListGroup>
          {rest.map((r) => {
            const rt = describeEventTime(r.starts_at, r.ends_at, r.timezone, viewerZone());
            return (
              <ListItem
                key={r.event_id}
                title={r.title}
                subtitle={`${rt.dateLabel} · ${rt.startLabel}${r.location_name ? ` · ${r.location_name}` : ''}`}
                onPress={() => router.push(`/events/${r.event_id}`)}
              />
            );
          })}
        </ListGroup>
      ) : null}
    </View>
  );
}
