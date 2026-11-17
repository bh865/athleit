import { componentTokens, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon, Logo } from '@/components/ui';

import { ContextSwitcher } from './context-switcher';

/**
 * Top-level screen header from the design system: the mark, the glass role pill, and the bell
 * (opens Alerts) on the right. Detail screens use a round glass back button instead (BackLink).
 */
export function AppHeader() {
  const router = useRouter();
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
    </View>
  );
}
