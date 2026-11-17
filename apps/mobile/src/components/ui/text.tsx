import { fontSize, type FontSizeToken } from '@athleit/tokens';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { fontFace } from '@/lib/fonts';

import { useTheme } from './theme';

export interface TextProps extends RNTextProps {
  size?: FontSizeToken;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Muted secondary colour. */
  muted?: boolean;
  /** IBM Plex Mono for amounts, codes and IDs. */
  mono?: boolean;
}

export function Text({
  size = 'base',
  weight = 'regular',
  muted,
  mono,
  style,
  ...rest
}: TextProps) {
  const { theme } = useTheme();
  const [fontSizePx, lineHeight] = fontSize[size];
  const family = mono
    ? fontFace.mono[weight === 'regular' ? 'regular' : 'medium']
    : fontFace.sans[weight];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: fontSizePx,
          lineHeight,
          color: muted ? theme.color.textMuted : theme.color.text,
        },
        style,
      ]}
    />
  );
}
