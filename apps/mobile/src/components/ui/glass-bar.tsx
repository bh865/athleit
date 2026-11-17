import { glassMaterials, radii, rnRgba, type GlassLevel } from '@athleit/tokens';
import { BlurTargetView, BlurView } from 'expo-blur';
import {
  createContext,
  use,
  useRef,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from './theme';

type BlurTarget = RefObject<ComponentRef<typeof View> | null> | null;
const BlurTargetContext = createContext<BlurTarget>(null);

/**
 * Wrap the content that scrolls/sits *behind* glass. On Android, expo-blur can only blur a
 * designated target view; on iOS this is a plain View. Glass renders fine without it (Android
 * then shows the tint only), so it's optional but recommended.
 */
export function GlassBackdrop({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  return (
    <BlurTargetContext value={ref}>
      <BlurTargetView ref={ref} style={style}>
        {children}
      </BlurTargetView>
    </BlurTargetContext>
  );
}

export interface GlassBarProps extends ViewProps {
  /** Material strength: bar (lightest) < sheet < modal (most opaque). */
  level?: GlassLevel;
}

/** Blur strength 0..100 for expo-blur, scaled from the token blur radius (px). */
const intensityFor = (blurPx: number) => Math.min(100, Math.round(blurPx * 2.2));

/**
 * Frosted-glass surface (expo-blur + token tint + edge highlight). With "Reduce transparency"
 * (iOS setting or the in-app override) it renders the solid surface colour instead, no blur.
 */
export function GlassBar({ level = 'bar', style, children, ...rest }: GlassBarProps) {
  const { theme, reduceTransparency } = useTheme();
  const blurTarget = use(BlurTargetContext);
  const spec = theme.glass[level];
  const borderRadius = level === 'bar' ? radii.xl : radii['2xl'];

  if (reduceTransparency) {
    return (
      <View
        {...rest}
        style={[
          {
            borderRadius,
            borderWidth: 1,
            borderColor: theme.color.border,
            backgroundColor: theme.color.surface,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      {...rest}
      style={[
        {
          borderRadius,
          borderWidth: 1,
          borderColor: rnRgba(spec.borderHighlight.color, spec.borderHighlight.opacity),
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <BlurView
        pointerEvents="none"
        intensity={intensityFor(glassMaterials[level].blur)}
        tint={theme.name}
        {...(Platform.OS === 'android' && blurTarget
          ? { blurTarget, blurMethod: 'dimezisBlurView' as const }
          : {})}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: rnRgba(spec.tint.color, spec.tint.opacity) },
        ]}
      />
      {children}
    </View>
  );
}
