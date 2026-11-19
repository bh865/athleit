import { componentTokens, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar, Icon, Logo } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

import { ContextSwitcher } from './context-switcher';

/**
 * Top-level screen header from the design system: the mark, the glass role pill, and the bell
 * (opens Alerts) on the right. Detail screens use a round glass back button instead (BackLink).
 */
export function AppHeader() {
  const router = useRouter();
  const { displayName, email, avatarUrl } = useApp();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
      }}
    >
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Logo variant="mark" size={32} />
        <ContextSwitcher />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alerts"
          onPress={() => router.push('/notifications' as never)}
          style={{
            width: componentTokens.minTarget,
            height: componentTokens.minTarget,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="bell" size="lg" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          testID="header-account"
          onPress={() => router.push('/account' as never)}
          style={{
            width: componentTokens.minTarget,
            height: componentTokens.minTarget,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar name={displayName ?? email ?? 'Account'} src={avatarUrl} size="sm" />
        </Pressable>
      </View>
    </View>
  );
}
