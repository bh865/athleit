import { componentTokens, radius, space } from '@athleit/tokens';
import type { StatusTone } from '@athleit/ui-core';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { StatusDot } from './status-dot';
import { Text } from './text';
import { useTheme } from './theme';

export type BadgeTone = StatusTone | 'count';

/**
 * neutral: quiet pill. success / warning / danger: an 8px status dot with its label.
 * count: lime pill with mono text.
 */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const { theme } = useTheme();
  const c = theme.color;
  if (tone === 'success' || tone === 'warning' || tone === 'danger')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <StatusDot tone={tone} />
        <Text variant="caption">{children}</Text>
      </View>
    );
  const count = tone === 'count';
  return (
    <View
      style={{
        minWidth: componentTokens.badge.minWidth,
        height: componentTokens.badge.height,
        paddingHorizontal: space[2],
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: count ? c.accent : c.surfaceAlt,
      }}
    >
      <Text variant={count ? 'monoSm' : 'label'} style={{ color: count ? c.accentInk : c.ink }}>
        {children}
      </Text>
    </View>
  );
}
