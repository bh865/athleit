import { countsBar, type RsvpCounts } from '@athleit/core';
import { radius, space } from '@athleit/tokens';
import { View } from 'react-native';

import { Icon, Text, useTheme } from '@/components/ui';

const ICON = { going: 'check-circle', not_going: 'x-circle', maybe: 'question', no_reply: 'circle-dashed' } as const;

/** Going, Can't go, Maybe and No reply: a thin stacked bar plus a legend (icon, mono number, optional word). */
export function CountsBar({ counts, legend = true }: { counts: RsvpCounts; legend?: boolean }) {
  const { theme } = useTheme();
  const c = theme.color;
  const bar = countsBar(counts);
  const fill = { going: c.ok, not_going: c.bad, maybe: c.warn, no_reply: c.muted } as const;
  const word = { going: 'Going', not_going: 'Can’t go', maybe: 'Maybe', no_reply: 'No reply' } as const;
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Replies: ${bar.spoken}`}
      style={{ gap: space[2] }}
      testID="rsvp-counts"
    >
      <View
        style={{
          flexDirection: 'row',
          height: space[2],
          gap: space[1] / 2,
          overflow: 'hidden',
          borderRadius: radius.pill,
          backgroundColor: c.surfaceAlt,
        }}
      >
        {bar.segments.map((s) => (
          <View key={s.key} style={{ flexGrow: s.value, backgroundColor: fill[s.key], minWidth: space[1] / 2 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
        {(['going', 'not_going', 'maybe', 'no_reply'] as const).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Icon name={ICON[k]} size="sm" color={c.muted} />
            <Text variant="mono">{counts[k]}</Text>
            {legend ? (
              <Text variant="caption" muted>
                {word[k]}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
