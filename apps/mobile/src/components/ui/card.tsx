import { radii, spacing } from '@athleit/tokens';
import { View, type ViewProps } from 'react-native';

import { useTheme } from './theme';

export function Card({ style, ...rest }: ViewProps) {
  const { theme } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          padding: spacing[6],
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        },
        style,
      ]}
    />
  );
}
