import { componentTokens, radius, space } from '@athleit/tokens';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './glass';
import { useTheme } from './theme';

/** Glass sheet. `level="modal"` for confirm and pay dialogs. */
export function Sheet({
  open,
  onClose,
  title,
  level = 'sheet',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  level?: 'sheet' | 'modal';
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [dy] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (open) dy.setValue(0);
  }, [open, dy]);
  // Drag the grabber down to dismiss: past 100px or a quick flick closes, otherwise it springs back.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, g) => dy.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 100 || g.vy > 0.8) onClose();
          else Animated.spring(dy, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(dy, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dy, onClose],
  );
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.color.scrim }}
      >
        <Animated.View style={{ transform: [{ translateY: dy }] }}>
          <Pressable onPress={() => undefined} accessibilityLabel={title}>
            <Glass
              level={level}
              cornerRadius={radius.xl}
              style={{
                margin: space[4],
                marginBottom: insets.bottom + space[4],
                padding: space[6],
                gap: space[4],
              }}
            >
              <View
                {...pan.panHandlers}
                accessibilityLabel="Drag down to close"
                style={{
                  alignSelf: 'stretch',
                  alignItems: 'center',
                  marginTop: -space[2],
                  paddingVertical: space[3],
                }}
              >
                <View
                  style={{
                    width: componentTokens.sheetGrabber.width,
                    height: componentTokens.sheetGrabber.height,
                    borderRadius: radius.pill,
                    backgroundColor: theme.color.muted,
                    opacity: 0.5,
                  }}
                />
              </View>
              {children}
            </Glass>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
