import { space } from '@athleit/tokens';
import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from './backdrop';

/** Backdrop-painted, safe-area-aware, scrollable screen container. */
export function Screen({
  children,
  contentStyle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: space[4], gap: space[6], flexGrow: 1 }, contentStyle]}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Backdrop>
  );
}
