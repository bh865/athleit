import { componentTokens, radius, space } from '@athleit/tokens';
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
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
              style={{
                alignSelf: 'center',
                width: componentTokens.sheetGrabber.width,
                height: componentTokens.sheetGrabber.height,
                borderRadius: radius.pill,
                backgroundColor: theme.color.muted,
                opacity: 0.5,
              }}
            />
            {children}
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
