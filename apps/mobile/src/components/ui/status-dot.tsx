import { componentTokens } from '@athleit/tokens';
import { statusColorToken, type StatusTone } from '@athleit/ui-core';
import { View } from 'react-native';

import { useTheme } from './theme';

/** 8px status dot. Always pair it with a text label. */
export function StatusDot({ tone }: { tone: Exclude<StatusTone, 'neutral'> }) {
  const { theme } = useTheme();
  const size = componentTokens.statusDot.size;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.color[statusColorToken[tone]],
      }}
    />
  );
}
