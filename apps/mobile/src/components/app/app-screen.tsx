import { spacing } from '@athleit/tokens';
import { usePathname, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ThemeToggle, useTheme } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';

import { ContextSwitcher } from './context-switcher';
import { LoadState, Notice } from './kit';

/** Signed-in screen frame: top bar with the context switcher, then scrollable content. */
export function AppScreen({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { status } = useApp();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2],
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
        }}
      >
        {pathname !== '/' && (
          <Button title="Home" variant="ghost" onPress={() => router.replace('/')} />
        )}
        {status === 'ready' ? <ContextSwitcher /> : <View style={{ flex: 1 }} />}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing[4], gap: spacing[5], flexGrow: 1 }}
      >
        {status === 'error' ? (
          <Notice tone="error">
            We couldn’t load your account. Pull to refresh or sign in again.
          </Notice>
        ) : (
          <LoadState loading={status !== 'ready'} error={null}>
            {children}
          </LoadState>
        )}
        {/* Account controls live at the bottom so the top bar stays usable on narrow phones. */}
        <View style={{ gap: spacing[3], marginTop: spacing[6] }}>
          <ThemeToggle />
          <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
