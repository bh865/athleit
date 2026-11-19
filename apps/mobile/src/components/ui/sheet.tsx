import { componentTokens, radius, space } from '@athleit/tokens';
import { useMemo, useState, type ReactNode } from 'react';
import { Animated, Keyboard, Modal, PanResponder, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './glass';
import { useTheme } from './theme';

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.8;

/** Glass sheet. Drag the handle down to dismiss. `level="modal"` for confirm and pay dialogs. */
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
  // Drag the handle down to dismiss; a short drag springs back.
  const [y] = useState(() => new Animated.Value(0));
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          Keyboard.dismiss();
          return true;
        },
        onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
            onClose();
            y.setValue(0);
          } else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [y, onClose],
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
        <Animated.View style={{ transform: [{ translateY: y }] }}>
          <Pressable onPress={Keyboard.dismiss} accessibilityLabel={title}>
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
                  paddingVertical: space[2],
                  marginVertical: -space[2],
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
