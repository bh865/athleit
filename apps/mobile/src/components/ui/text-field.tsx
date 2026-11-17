import { componentTokens, space, textStyles } from '@athleit/tokens';
import { useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { fontFace } from '@/lib/fonts';

import { Text } from './text';
import { useTheme } from './theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Monospace face for codes, IDs and amounts. */
  mono?: boolean;
}

/** 52 high, radius 18, surface-alt fill; focused = 2px "sent" border. */
export function TextField({ label, error, hint, mono, onFocus, onBlur, ...input }: TextFieldProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const [focused, setFocused] = useState(false);
  const id = useId();
  const { height, radius, focusBorder } = componentTokens.input;

  return (
    <View style={{ gap: space[2] }}>
      <Text variant="caption" nativeID={id}>
        {label}
      </Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityLabelledBy={id}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.muted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: height,
          paddingHorizontal: space[4],
          borderRadius: radius,
          borderWidth: focusBorder,
          borderColor: error ? c.bad : focused ? c.bubbleOwn : 'transparent',
          backgroundColor: c.surfaceAlt,
          color: c.ink,
          fontFamily: mono ? fontFace.mono.medium : fontFace.sans.semibold,
          fontSize: textStyles.body.size,
        }}
      />
      {error ? (
        <Text variant="caption" accessibilityRole="alert" style={{ color: c.bad }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
