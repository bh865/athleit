import { space } from '@athleit/tokens';
import { usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop, Button, Sheet, TabBar, Text, ThemeToggle, type TabItem } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';

import { ContextSwitcher } from './context-switcher';
import { ErrorNotice, Loading } from './app-screen-states';

/** Signed-in screen frame: context switcher on top, content, floating glass tab bar. */
export function AppScreen({ children }: { children: ReactNode }) {
  const { status, contexts } = useApp();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const hasFamily = contexts.some((c) => c.kind === 'family');
  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: 'house' },
    ...(hasFamily ? [{ key: 'family', label: 'Family', icon: 'house-line' } as TabItem] : []),
    { key: 'more', label: 'More', icon: 'dots-three-circle' },
  ];
  const active = more
    ? 'more'
    : pathname.startsWith('/family')
      ? 'family'
      : pathname === '/'
        ? 'home'
        : null;

  return (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}>
          {status === 'ready' ? <ContextSwitcher /> : null}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space[4],
            gap: space[6],
            flexGrow: 1,
            paddingBottom: space[12] * 3,
          }}
        >
          {status === 'error' ? <ErrorNotice /> : status !== 'ready' ? <Loading /> : children}
        </ScrollView>
      </SafeAreaView>
      <TabBar
        items={tabs}
        active={active}
        onSelect={(key) => {
          if (key === 'more') setMore(true);
          else router.replace(key === 'home' ? '/' : '/family');
        }}
      />
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <Text variant="heading">More</Text>
        <ThemeToggle />
        <Button title="Sign out" variant="ghost" icon="sign-out" onPress={() => void signOut()} />
      </Sheet>
    </Backdrop>
  );
}
