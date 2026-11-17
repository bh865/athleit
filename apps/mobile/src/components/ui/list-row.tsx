import { componentTokens, space } from '@athleit/tokens';
import { createContext, use, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

const GroupContext = createContext(false);

export interface ListRowProps {
  /** Left slot: a 44px Avatar or IconCircle. */
  leading?: ReactNode;
  title: string;
  subtitle?: string | undefined;
  /** Right slot: amount, badge, buttons. */
  trailing?: ReactNode;
  /** Navigable rows show a caret. */
  onPress?: () => void;
  selected?: boolean;
  last?: boolean;
  testID?: string;
}

/** 64px row with a 1px separator, 44px leading slot and a caret when navigable. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  selected,
  last,
  testID,
}: ListRowProps) {
  const { theme } = useTheme();
  const grouped = use(GroupContext);
  const c = theme.color;
  const body = (
    <>
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <Icon name="caret-right" size="sm" color={c.muted} /> : null}
    </>
  );
  const style = {
    minHeight: componentTokens.listRow.height,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    paddingVertical: space[2],
    borderBottomWidth: grouped && !last ? 1 : 0,
    borderBottomColor: c.line,
    backgroundColor: selected ? c.surfaceAlt : 'transparent',
  };
  return onPress ? (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

/** A column of rows on a surface card, separated by 1px lines. */
export function ListGroup({ children, testID }: { children: ReactNode; testID?: string }) {
  const { theme } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: space[4],
        borderRadius: componentTokens.card.radius,
        borderWidth: componentTokens.card.border,
        borderColor: theme.color.line,
        overflow: 'hidden',
        backgroundColor: theme.color.surface,
      }}
    >
      {/* Rows draw a bottom separator; pull the last one under the card edge. */}
      <GroupContext value>
        <View style={{ marginBottom: -1 }}>{children}</View>
      </GroupContext>
    </View>
  );
}

export function IconCircle({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const s = componentTokens.listRow.iconSize;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surfaceAlt,
      }}
    >
      {children}
    </View>
  );
}
