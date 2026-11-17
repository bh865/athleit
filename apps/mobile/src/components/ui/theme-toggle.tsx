import type { ThemeMode } from '@athleit/tokens';
import { radii, spacing } from '@athleit/tokens';
import { Desktop, Moon, Sun } from 'phosphor-react-native';
import { Pressable, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

const OPTIONS = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Desktop },
] as const satisfies readonly { mode: ThemeMode; label: string; Icon: typeof Sun }[];

export function ThemeToggle() {
  const { mode, setMode, theme } = useTheme();
  const c = theme.color;
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        padding: spacing[1],
        gap: spacing[1],
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surfaceMuted,
      }}
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        const fg = active ? c.onAccent : c.textMuted;
        return (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setMode(m)}
            style={{
              minHeight: 40,
              paddingHorizontal: spacing[3],
              borderRadius: radii.full,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[1],
              backgroundColor: active ? c.accent : 'transparent',
            }}
          >
            <Icon size={18} color={fg} weight={active ? 'fill' : 'regular'} />
            <Text size="sm" weight="semibold" style={{ color: fg }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
