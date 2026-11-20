import { componentTokens, space, textStyles } from '@athleit/tokens';
import { useId, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { fontFace } from '@/lib/fonts';

import { Text } from './text';
import { useTheme } from './theme';

/** The instance type of the underlying input, for refs that move focus. */
export type TextFieldInput = ComponentRef<typeof TextInput>;

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Monospace face for codes, IDs and amounts. */
  mono?: boolean;
  /** Trailing control inside the field (for example a show/hide toggle). It must be a 44px target. */
  right?: ReactNode;
  /** Lets a form move focus to the first invalid field. */
  inputRef?: Ref<TextFieldInput>;
}

/** 52 high, radius 18, surface-alt fill; focused = 2px "sent" border. */
export function TextField({
  label,
  error,
  hint,
  mono,
  right,
  inputRef,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
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
      <View>
        <TextInput
          {...input}
          ref={inputRef}
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
            paddingLeft: space[4],
            paddingRight: right ? space[4] + componentTokens.iconButton.size : space[4],
            borderRadius: radius,
            borderWidth: focusBorder,
            borderColor: error ? c.bad : focused ? c.bubbleOwn : 'transparent',
            backgroundColor: c.surfaceAlt,
            color: c.ink,
            fontFamily: mono ? fontFace.mono.medium : fontFace.sans.semibold,
            fontSize: textStyles.body.size,
          }}
        />
        {right ? (
          <View
            style={{ position: 'absolute', right: space[1], top: 0, bottom: 0, justifyContent: 'center' }}
          >
            {right}
          </View>
        ) : null}
      </View>
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
