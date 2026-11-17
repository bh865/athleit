import { componentTokens } from '@athleit/tokens';
import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Text } from './text';
import { useTheme } from './theme';

export interface LogoProps {
  variant?: 'mark' | 'lockup' | 'app-icon';
  /** px of the glyph. */
  size?: number;
}

/** Mark per the Logo file: charcoal on light, lime on dark (the `bubbleOwn` colour). */
function Glyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="12 24.5 67 67" accessibilityLabel="Athleit">
      <Circle cx={42} cy={58} r={20} fill="none" stroke={color} strokeWidth={14} />
      <Rect x={62} y={31} width={14} height={54} rx={7} fill={color} />
    </Svg>
  );
}

export function Logo({ variant = 'lockup', size = 32 }: LogoProps) {
  const { theme } = useTheme();
  const c = theme.color;
  if (variant === 'app-icon')
    return (
      <View
        style={{
          width: size * 1.75,
          height: size * 1.75,
          borderRadius: size * 0.45,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Glyph size={size * 1.1} color={c.accentInk} />
      </View>
    );
  if (variant === 'mark') return <Glyph size={size} color={c.bubbleOwn} />;
  return (
    <View
      accessibilityLabel="Athleit"
      style={{ flexDirection: 'row', alignItems: 'center', gap: componentTokens.minTarget / 5.5 }}
    >
      <Glyph size={size} color={c.bubbleOwn} />
      <Text
        variant="title"
        style={{ fontSize: size * 0.83, lineHeight: size, letterSpacing: -0.035 * size * 0.83 }}
      >
        athleit
      </Text>
    </View>
  );
}
