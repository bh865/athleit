import { space } from '@athleit/tokens';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from './backdrop';

/** Backdrop-painted, safe-area-aware, scrollable screen container. */
export function Screen({
  children,
  contentStyle,
  avoidKeyboard,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Forms: lifts the content above the keyboard so the primary button stays reachable. */
  avoidKeyboard?: boolean;
}) {
  return (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          enabled={Boolean(avoidKeyboard)}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardDismissMode={avoidKeyboard ? 'interactive' : 'none'}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              { padding: space[4], gap: space[6], flexGrow: 1 },
              contentStyle,
            ]}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Backdrop>
  );
}
