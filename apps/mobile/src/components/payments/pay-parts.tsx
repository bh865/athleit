import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, Text, useTheme } from '@/components/ui';

import { StatusPill, type PillTone } from './staff-parts';

/** Mono kicker above a number or a list ("AMOUNT DUE", "NOVEMBER 2026"). */
export const Kicker = ({ children }: { children: string }) => (
  <Text variant="label" muted accessibilityRole="header">
    {children.toUpperCase()}
  </Text>
);

/** A label on the left, a value on the right, at least a 44pt target tall. */
export function Row({ k, v, quiet }: { k: ReactNode; v: ReactNode; quiet?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space[3],
        minHeight: componentTokens.minTarget,
      }}
    >
      {typeof k === 'string' ? <Text muted={quiet}>{k}</Text> : k}
      {v}
    </View>
  );
}

/** Same map as web's PILL: which tone and icon each due state gets. The label always carries the meaning. */
export const DUE_PILL: Record<string, { tone: PillTone; icon: IconName }> = {
  overdue: { tone: 'bad', icon: 'warning' },
  today: { tone: 'warn', icon: 'clock' },
  soon: { tone: 'warn', icon: 'clock' },
  later: { tone: 'neutral', icon: 'calendar-blank' },
  processing: { tone: 'warn', icon: 'hourglass' },
  paid: { tone: 'ok', icon: 'check-circle' },
  refunded: { tone: 'neutral', icon: 'arrow-bend-up-left' },
  closed: { tone: 'neutral', icon: 'minus-circle' },
};

export { StatusPill };

/** Icon + one line in a tinted strip (overdue, paid separately). Text, not color alone, says what it is. */
export function Strip({
  tone,
  icon,
  children,
}: {
  tone: 'bad' | 'neutral';
  icon: IconName;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const bad = tone === 'bad';
  return (
    <View
      accessibilityRole={bad ? 'alert' : 'summary'}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[2],
        padding: space[3],
        borderRadius: radius.md,
        backgroundColor: bad ? c.badSoft : c.surfaceAlt,
      }}
    >
      <Icon name={icon} size="sm" weight={bad ? 'fill' : 'regular'} color={bad ? c.bad : c.ink} />
      <Text variant="caption" style={{ flex: 1, color: bad ? c.bad : c.ink }}>
        {children}
      </Text>
    </View>
  );
}
