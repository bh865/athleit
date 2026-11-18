import { blobGeometry, splitColor } from '@athleit/ui-core';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GlassBackdrop } from './glass';
import { useTheme } from './theme';

/**
 * App background: the background colour with soft radial blobs so glass has something to refract.
 *
 * Matches the web CSS (`radial-gradient(circle at x y, colour, transparent N%)`): circles sized to the
 * farthest corner, and alpha passed as `stopOpacity` because react-native-svg ignores the alpha channel
 * of `stopColor` (which rendered the blobs at full strength).
 */
export function Backdrop({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={{ flex: 1, backgroundColor: theme.color.background }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
      }}
    >
      <GlassBackdrop style={StyleSheet.absoluteFill}>
        {size ? (
          <Svg width={size.w} height={size.h} testID="backdrop-blobs">
            <Defs>
              {theme.blobs.map((b, i) => {
                const g = blobGeometry(b, size.w, size.h);
                const c = splitColor(b.color);
                return (
                  <RadialGradient
                    key={i}
                    id={`blob${i}`}
                    cx={g.cx}
                    cy={g.cy}
                    rx={g.r}
                    ry={g.r}
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop offset="0" stopColor={c.hex} stopOpacity={c.alpha} />
                    <Stop offset="1" stopColor={c.hex} stopOpacity={0} />
                  </RadialGradient>
                );
              })}
            </Defs>
            {theme.blobs.map((_, i) => (
              <Rect key={i} x={0} y={0} width={size.w} height={size.h} fill={`url(#blob${i})`} />
            ))}
          </Svg>
        ) : null}
      </GlassBackdrop>
      {children}
    </View>
  );
}
