import { textStyles, type TextVariant } from '@athleit/tokens';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { fontFace } from '@/lib/fonts';

import { useTheme } from './theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Muted secondary colour. */
  muted?: boolean;
}

/** Typography from the type-scale tokens. Fonts are loaded once in lib/fonts.ts. */
export function Text({ variant = 'body', muted, style, ...rest }: TextProps) {
  const { theme } = useTheme();
  const t = textStyles[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fontFace[t.family][t.weight],
          fontSize: t.size,
          lineHeight: t.lineHeight,
          letterSpacing: t.letterSpacing * t.size,
          ...(t.uppercase ? { textTransform: 'uppercase' as const } : null),
          color: muted ? theme.color.muted : theme.color.ink,
        },
        style,
      ]}
    />
  );
}

export const Heading = (p: Omit<TextProps, 'variant'> & { level?: 'title' | 'heading' }) => {
  const { level = 'heading', ...rest } = p;
  return <Text variant={level} accessibilityRole="header" {...rest} />;
};
export const Label = (p: Omit<TextProps, 'variant'>) => <Text variant="label" muted {...p} />;
export const Mono = (p: Omit<TextProps, 'variant'>) => <Text variant="mono" {...p} />;
