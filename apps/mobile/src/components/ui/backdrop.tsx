import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GlassBackdrop } from './glass';
import { useTheme } from './theme';

/** App background: the background colour with soft radial blobs so glass has something to refract. */
export function Backdrop({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <GlassBackdrop style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            {theme.blobs.map((b, i) => (
              <RadialGradient
                key={i}
                id={`blob${i}`}
                cx={`${b.x}%`}
                cy={`${b.y}%`}
                rx={`${b.stop}%`}
                ry={`${b.stop}%`}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={b.color} />
                <Stop offset="1" stopColor={b.color} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {theme.blobs.map((_, i) => (
            <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#blob${i})`} />
          ))}
        </Svg>
      </GlassBackdrop>
      {children}
    </View>
  );
}
