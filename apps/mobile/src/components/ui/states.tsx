import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, View } from 'react-native';

import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

function Circle({ icon, color }: { icon: IconName; color?: string }) {
  const { theme } = useTheme();
  const s = componentTokens.emptyState.iconCircle;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surfaceAlt,
      }}
    >
      <Icon name={icon} size="xl" color={color ?? theme.color.ink} />
    </View>
  );
}

/** 88px icon circle, title, one line of body text, at most one action. */
export function EmptyState({
  icon = 'tray',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', gap: space[2], padding: space[6] }}>
      <Circle icon={icon} />
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** Icon, plain message, "Try again". */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{ alignItems: 'center', gap: space[2], padding: space[6] }}
    >
      <Circle icon="warning-circle" color={theme.color.bad} />
      <Text variant="bodyBold" style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Skeleton rows while loading. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  const { theme } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: space[3] }}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            opacity,
            height: componentTokens.skeleton.rowHeight,
            borderRadius: radius.md,
            backgroundColor: theme.color.surfaceAlt,
          }}
        />
      ))}
    </View>
  );
}
