import { space } from '@athleit/tokens';
import { usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop, Button, Sheet, TabBar, Text, ThemeToggle, type TabItem } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';
import { useUnread } from '@/lib/use-unread';

import { ContextSwitcher } from './context-switcher';
import { ErrorNotice, Loading } from './app-screen-states';

/** Signed-in screen frame: context switcher on top, content, floating glass tab bar. */
export function AppScreen({ children }: { children: ReactNode }) {
  const { status, contexts, userId } = useApp();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const hasFamily = contexts.some((c) => c.kind === 'family');
  const hasTeam = contexts.some((c) => c.kind === 'team');
  const unread = useUnread(userId, hasTeam);
  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: 'house' },
    ...(contexts.length > 0
      ? [{ key: 'schedule', label: 'Schedule', icon: 'calendar-blank' } as TabItem]
      : []),
    ...(hasTeam
      ? [{ key: 'messages', label: 'Messages', icon: 'chat-circle', badge: unread } as TabItem]
      : []),
    ...(hasFamily ? [{ key: 'family', label: 'Family', icon: 'house-line' } as TabItem] : []),
    { key: 'more', label: 'More', icon: 'dots-three-circle' },
  ];
  const active = more
    ? 'more'
    : pathname.startsWith('/schedule') || pathname.startsWith('/events')
      ? 'schedule'
      : pathname.startsWith('/messages')
        ? 'messages'
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
          else
            router.replace(
              key === 'home'
                ? '/'
                : key === 'schedule'
                  ? '/schedule'
                  : key === 'messages'
                    ? '/messages'
                    : '/family',
            );
        }}
      />
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <Text variant="heading">More</Text>
        <Button
          title="Alerts"
          variant="secondary"
          icon="bell"
          onPress={() => {
            setMore(false);
            router.push('/notifications' as never);
          }}
        />
        <ThemeToggle />
        <Button title="Sign out" variant="ghost" icon="sign-out" onPress={() => void signOut()} />
      </Sheet>
    </Backdrop>
  );
}
