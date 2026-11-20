import { EVENT_TYPE_LABELS, rowState, rowTimeLabel, type EventType } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Icon, Text, useTheme } from '@/components/ui';
import { viewerZone } from '@/lib/viewer-zone';

import { CountsBar } from './counts-bar';
import type { ScheduleItem } from './items';
import { RsvpChipRow } from './rsvp-chips';

const TYPE_ICON: Record<EventType, 'flag' | 'users-three' | 'calendar-blank'> = {
  game: 'flag',
  practice: 'users-three',
  event: 'calendar-blank',
};
const OUTCOME = { win: 'W', loss: 'L', tie: 'T' } as const;

/**
 * One event in the agenda and the day list. Families see a chip and quick actions per child; staff and club
 * admins see the counts bar. Priority when several states apply: Live now, Cancelled, Needs reply, Updated.
 */
export function EventCard({
  item,
  now,
  onPress,
  showTeam = false,
  showCounts = false,
  onChanged,
}: {
  item: ScheduleItem;
  now: Date;
  onPress: () => void;
  showTeam?: boolean;
  showCounts?: boolean;
  onChanged?: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const zone = viewerZone();
  const t = rowTimeLabel(item, zone);
  const state = rowState(item, now);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: item.timezone, weekday: 'short', day: 'numeric' }).formatToParts(
    new Date(item.starts_at),
  );
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const result = item.result
    ? `${OUTCOME[item.result.outcome as keyof typeof OUTCOME] ?? ''} ${item.result.our}–${item.result.their}`.trim()
    : null;
  const vs =
    item.type === 'game' && item.opponent
      ? `vs. ${item.opponent}${item.home_away === 'home' ? ' · Home' : item.home_away === 'away' ? ' · Away' : ''}`
      : null;
  const label = [
    `${EVENT_TYPE_LABELS[item.type]}: ${item.title}`,
    `${weekday} ${t.range}`,
    item.location,
    state.cancelled ? 'cancelled' : state.live ? 'live now' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const tag = (text: string, bg: string, fg: string) => (
    <View key={text} style={{ paddingVertical: space[1], paddingHorizontal: space[3], borderRadius: componentTokens.chip.radius, backgroundColor: bg }}>
      <Text variant="caption" style={{ color: fg }}>
        {text}
      </Text>
    </View>
  );

  return (
    <View
      testID="event-card"
      style={{
        gap: space[3],
        padding: space[4],
        borderRadius: radius.lg,
        borderWidth: componentTokens.card.border,
        borderColor: state.live ? c.accent : c.line,
        backgroundColor: c.surface,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: componentTokens.minTarget }}
      >
        <View style={{ width: componentTokens.schedule.dateBlockMobile, alignItems: 'center' }}>
          <Text variant="label" muted>
            {weekday.toUpperCase()}
          </Text>
          <Text variant="title">{day}</Text>
        </View>
        <View style={{ flex: 1, gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text
              variant="bodyBold"
              style={[{ flexShrink: 1 }, state.cancelled ? { textDecorationLine: 'line-through', color: c.muted } : null]}
            >
              {item.title}
            </Text>
            {state.series ? <Icon name="repeat" size="sm" color={c.muted} /> : null}
          </View>
          <Text variant="caption" muted>
            {state.cancelled ? `Cancelled${item.cancelled_reason ? `: ${item.cancelled_reason}` : ''}` : `${t.range}${item.location ? ` · ${item.location}` : ''}`}
          </Text>
          {t.yourTime && !state.cancelled ? (
            <Text variant="caption" muted>
              Your time {t.yourTime}
            </Text>
          ) : null}
          {vs ? (
            <Text variant="caption" muted>
              {vs}
            </Text>
          ) : null}
          {showTeam && item.team_name ? (
            <Text variant="caption" muted>
              {item.team_name}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[1] }}>
            {state.live ? tag('Live now', c.accent, c.accentInk) : null}
            {state.needsReply && !state.cancelled ? tag('Needs reply', c.warnSoft, c.warn) : null}
            {state.updated ? tag('Updated', c.surfaceAlt, c.ink) : null}
            {result ? tag(`Final ${result}`, c.surfaceAlt, c.ink) : null}
            {tag(EVENT_TYPE_LABELS[item.type], c.surfaceAlt, c.ink)}
          </View>
        </View>
        <Icon name={TYPE_ICON[item.type]} size="sm" color={c.muted} />
      </Pressable>
      {item.children && item.children.length > 0
        ? item.children.map((ch) => (
            <RsvpChipRow key={ch.player_id} eventId={item.id} child={ch} quickActions={state.quickActions} onChanged={onChanged} />
          ))
        : null}
      {showCounts && item.counts && !state.cancelled ? <CountsBar counts={item.counts} legend={false} /> : null}
    </View>
  );
}
