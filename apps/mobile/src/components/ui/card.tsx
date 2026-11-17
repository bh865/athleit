import { componentTokens, space } from '@athleit/tokens';
import { View, type ViewProps } from 'react-native';

import { useTheme } from './theme';

/** Content surface: solid surface, 1px line, radius 24. Never glass. */
export function Card({ style, ...rest }: ViewProps) {
  const { theme } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          padding: space[6],
          borderRadius: componentTokens.card.radius,
          borderWidth: componentTokens.card.border,
          borderColor: theme.color.line,
          backgroundColor: theme.color.surface,
        },
        style,
      ]}
    />
  );
}
