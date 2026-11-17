import { EVENT_TYPE_LABELS, describeEventTime } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Icon, Text, useTheme } from '@/components/ui';
import { viewerZone } from '@/lib/viewer-zone';

import type { ScheduleItem } from './items';

/** Schedule row card: date block (weekday + big day number), title, "time · location", caret. */
export function EventCard({ item, onPress }: { item: ScheduleItem; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.color;
  const t = describeEventTime(item.starts_at, item.ends_at, item.timezone, viewerZone());
  const cancelled = item.status === 'cancelled';
  const caption = cancelled
    ? `Cancelled${item.cancelled_reason ? `: ${item.cancelled_reason}` : ''}`
    : [t.startLabel, item.location].filter(Boolean).join(' · ');
  const result = item.result
    ? `${item.result.outcome === 'win' ? 'W' : item.result.outcome === 'loss' ? 'L' : 'T'} ${item.result.our}-${item.result.their}`
    : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${EVENT_TYPE_LABELS[item.type]}: ${item.title}, ${t.dateLabel} ${t.startLabel}${item.location ? `, ${item.location}` : ''}${cancelled ? ', cancelled' : ''}`}
      testID="event-card"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[4],
        minHeight: componentTokens.minTarget,
        paddingVertical: space[4],
        paddingHorizontal: space[4],
        borderRadius: radius.lg,
        borderWidth: componentTokens.card.border,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <View style={{ width: componentTokens.schedule.dateBlockMobile, alignItems: 'center' }}>
        <Text variant="label" muted>
          {t.weekdayShort}
        </Text>
        <Text variant="title">{t.dayNumber}</Text>
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text
          variant="bodyBold"
          style={cancelled ? { textDecorationLine: 'line-through', color: c.muted } : undefined}
        >
          {item.title}
        </Text>
        <Text variant="caption" muted>
          {caption}
        </Text>
        {item.team_name ? (
          <Text variant="caption" muted>
            {item.team_name}
          </Text>
        ) : null}
      </View>
      {result ? <Text variant="mono">{result}</Text> : null}
      <Icon name="caret-right" size="sm" />
    </Pressable>
  );
}
