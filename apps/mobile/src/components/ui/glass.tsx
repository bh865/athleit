import { radius, type GlassLevel } from '@athleit/tokens';
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
 * designated target view; on iOS this is a plain View.
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

export interface GlassProps extends ViewProps {
  /** bar: nav and headers. sheet: drawers, popovers, toasts. modal: dialogs. Never for content cards. */
  level?: GlassLevel;
  /** Corner radius; defaults to the card-large step. */
  cornerRadius?: number;
}

/** Blur strength 0..100 for expo-blur, scaled from the token blur radius (px). */
const intensityFor = (blurPx: number) => Math.min(100, Math.round(blurPx * 1.6));

/**
 * The ONLY place expo-blur is used (enforced by lint). Reduced transparency (iOS setting or the
 * in-app override) renders the solid fallback with a visible edge: no blur, no shadow.
 */
export function Glass({
  level = 'bar',
  cornerRadius = radius.xl,
  style,
  children,
  ...rest
}: GlassProps) {
  const { theme, reduceTransparency } = useTheme();
  const blurTarget = use(BlurTargetContext);
  const g = theme.glass[level];

  if (reduceTransparency) {
    return (
      <View
        {...rest}
        style={[
          {
            borderRadius: cornerRadius,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: theme.color.line,
            backgroundColor: g.fallback,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  const shadow = g.shadow
    ? {
        shadowColor: theme.color.ink,
        shadowOffset: { width: 0, height: g.shadow.y / 2 },
        shadowOpacity: g.shadow.alpha * 1.5,
        shadowRadius: g.shadow.blur / 2,
      }
    : null;

  return (
    <View {...rest} style={[{ borderRadius: cornerRadius }, shadow, style]}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius, overflow: 'hidden' }]}
      >
        <BlurView
          intensity={intensityFor(g.blur)}
          tint={theme.scheme}
          {...(Platform.OS === 'android' && blurTarget
            ? { blurTarget, blurMethod: 'dimezisBlurView' as const }
            : {})}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: g.tint }]} />
        {/* Inner top highlight */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: cornerRadius / 2,
            right: cornerRadius / 2,
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: g.highlight,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: cornerRadius,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: g.border,
          },
        ]}
      />
      {children}
    </View>
  );
}
