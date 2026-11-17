import { radii, spacing } from '@athleit/tokens';
import { useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { fontFace } from '@/lib/fonts';

import { Text } from './text';
import { useTheme } from './theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Monospace face for codes and IDs. */
  mono?: boolean;
}

export function TextField({ label, error, hint, mono, onFocus, onBlur, ...input }: TextFieldProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const [focused, setFocused] = useState(false);
  const id = useId();

  return (
    <View style={{ gap: spacing[2] }}>
      <Text size="sm" weight="semibold" nativeID={id}>
        {label}
      </Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityLabelledBy={id}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: 48,
          paddingHorizontal: spacing[4],
          borderRadius: radii.md,
          borderWidth: focused ? 2 : 1,
          borderColor: error ? c.danger.text : focused ? c.focusRing : c.borderStrong,
          backgroundColor: c.surface,
          color: c.text,
          fontFamily: mono ? fontFace.mono.regular : fontFace.sans.regular,
          fontSize: 16,
        }}
      />
      {error ? (
        <Text size="sm" accessibilityRole="alert" style={{ color: c.danger.text }}>
          {error}
        </Text>
      ) : hint ? (
        <Text size="sm" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
