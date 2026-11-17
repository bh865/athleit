import { minTarget, radii, spacing } from '@athleit/tokens';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  /** Optional leading icon element (e.g. a Phosphor icon). */
  icon?: React.ReactNode;
  loading?: boolean;
}

/** Primary (lime) is for the one main action on a screen. */
export function Button({
  title,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const isDisabled = Boolean(disabled || loading);

  const palette = {
    primary: { bg: c.accent, pressed: c.accentPressed, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.surfaceMuted, pressed: c.border, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', pressed: c.surfaceMuted, fg: c.text, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      style={(state) => [
        {
          minHeight: 48,
          minWidth: minTarget,
          paddingHorizontal: spacing[6],
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: state.pressed ? palette.pressed : palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing[2],
          opacity: isDisabled ? 0.5 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text weight="semibold" style={{ color: palette.fg }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
