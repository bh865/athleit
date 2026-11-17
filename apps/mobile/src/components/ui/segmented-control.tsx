import { componentTokens, radius, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

/** Radio-group pill: selected segment uses the lime accent pill. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: space[1],
        gap: space[1],
        borderRadius: radius.pill,
        backgroundColor: c.surfaceAlt,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{
              minHeight: componentTokens.minTarget,
              justifyContent: 'center',
              paddingHorizontal: space[4],
              borderRadius: radius.pill,
              backgroundColor: on ? c.accent : 'transparent',
            }}
          >
            <Text variant="caption" style={{ color: on ? c.accentInk : c.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
