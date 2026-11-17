import { componentTokens, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './glass';
import { Icon } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

/** Floating glass tab bar: 68 high, radius 34; the active item is a lime pill with a fill icon. */
export function TabBar({
  items,
  active,
  onSelect,
}: {
  items: readonly TabItem[];
  active: string | null;
  onSelect: (key: string) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const t = componentTokens.tabBar;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space[4],
        right: space[4],
        bottom: insets.bottom + space[2],
      }}
    >
      <Glass
        level="bar"
        cornerRadius={t.radius}
        accessibilityRole="tablist"
        style={{
          height: t.height,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: space[2],
        }}
      >
        {items.map((i) => {
          const on = i.key === active;
          const fg = on ? theme.color.accentInk : theme.color.ink;
          return (
            <Pressable
              key={i.key}
              accessibilityRole="tab"
              accessibilityLabel={i.label}
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(i.key)}
              style={{
                width: t.itemWidth,
                height: t.itemHeight,
                borderRadius: t.itemHeight / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? theme.color.accent : 'transparent',
              }}
            >
              <Icon name={i.icon} weight={on ? 'fill' : 'regular'} size="lg" color={fg} />
              {on ? (
                <Text variant="caption" style={{ color: fg }}>
                  {i.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}
