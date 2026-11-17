import { componentTokens, radius, space } from '@athleit/tokens';
import type { ButtonVariant, IconName } from '@athleit/ui-core';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { Glass } from './glass';
import { Icon } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

export type { ButtonVariant };

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  /** Optional leading icon. */
  icon?: IconName;
  loading?: boolean;
}

/** Primary (lime pill, charcoal text in both modes) is for the one main action on a screen. */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
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
    primary: { bg: c.accent, pressed: c.accentPressed, fg: c.accentInk, border: 'transparent' },
    secondary: { bg: c.surfaceAlt, pressed: c.line, fg: c.ink, border: 'transparent' },
    ghost: { bg: 'transparent', pressed: c.surfaceAlt, fg: c.ink, border: c.line },
  }[variant];

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      style={(state) => [
        {
          minHeight:
            size === 'lg' ? componentTokens.button.heightLg : componentTokens.button.height,
          minWidth: componentTokens.button.minWidth,
          paddingHorizontal: space[6],
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: state.pressed ? palette.pressed : palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space[2],
          opacity: isDisabled ? 0.5 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? (
            <View>
              <Icon name={icon} size="sm" color={palette.fg} />
            </View>
          ) : null}
          <Text
            variant={variant === 'primary' ? 'bodyBold' : 'bodyBold'}
            style={{ color: palette.fg }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Round glass icon button (44 to 48). */
export function IconButton({
  icon,
  label,
  large,
  onPress,
}: {
  icon: IconName;
  label: string;
  large?: boolean;
  onPress?: () => void;
}) {
  const size = large ? componentTokens.iconButton.sizeLg : componentTokens.iconButton.size;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Glass
        level="bar"
        cornerRadius={size / 2}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} />
      </Glass>
    </Pressable>
  );
}
