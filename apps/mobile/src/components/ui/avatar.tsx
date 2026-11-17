import { componentTokens } from '@athleit/tokens';
import { avatarSlot, initialsOf, type AvatarSize } from '@athleit/ui-core';
import { Image, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';

/** Circle with initials on the rotating palette (lime, ice blue, charcoal), or a photo. */
export function Avatar({
  name,
  size = 'md',
  src,
}: {
  name: string;
  size?: AvatarSize;
  src?: string | null;
}) {
  const { theme } = useTheme();
  const px = componentTokens.avatar[size];
  const slot = avatarSlot(name);
  const base = { width: px, height: px, borderRadius: px / 2 };
  if (src) return <Image source={{ uri: src }} style={base} accessibilityElementsHidden />;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        base,
        {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color[`avatar${slot}`],
        },
      ]}
    >
      <Text
        variant={size === 'lg' ? 'bodyBold' : 'caption'}
        style={{ color: theme.color[`avatar${slot}Ink`] }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
