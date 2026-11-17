import { componentTokens, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

/** Filter/choice chip. Selected = "sent" fill. Without onPress it is a static tag. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityRole,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityRole?: 'radio' | 'button';
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const style = {
    minHeight: componentTokens.chip.height,
    justifyContent: 'center' as const,
    paddingHorizontal: space[3],
    borderRadius: componentTokens.chip.radius,
    backgroundColor: selected ? c.bubbleOwn : c.surfaceAlt,
  };
  const text = (
    <Text variant="caption" style={{ color: selected ? c.bubbleOwnInk : c.ink }}>
      {label}
    </Text>
  );
  return onPress ? (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={style}
    >
      {text}
    </Pressable>
  ) : (
    <View style={style}>{text}</View>
  );
}
