import type { AttentionItem, AttentionKind } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon, ListGroup, Sheet, Text, useTheme } from '@/components/ui';
import { ListItem } from '@/components/app/kit';

const ICON: Record<AttentionKind, IconName> = {
  rsvp: 'calendar-blank',
  result: 'flag',
  payment: 'credit-card',
  waiver: 'clipboard-text',
  registrationStep: 'receipt',
  joinRequests: 'users-three',
  loginClaims: 'user',
  linkRequests: 'link',
  registrationsToDecide: 'clipboard-text',
  payouts: 'bank',
  setup: 'list-checks',
};

/**
 * Horizontal attention chips. Only the first is lime; each pairs an icon with its text. When nothing is
 * open, one quiet line instead of a strip ("You're all caught up").
 */
export function AttentionStrip({
  shown,
  more,
  loading,
}: {
  shown: readonly AttentionItem[];
  more: readonly AttentionItem[];
  loading: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (shown.length === 0) {
    return loading ? null : (
      <Text variant="caption" muted testID="home-caught-up">
        You’re all caught up
      </Text>
    );
  }
  const chip = (primary: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    minHeight: componentTokens.iconButton.size,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: primary ? c.accent : c.line,
    backgroundColor: primary ? c.accent : c.surface,
  });
  return (
    <View style={{ gap: space[3] }} testID="home-attention" accessibilityRole="summary">
      <Text variant="label" muted accessibilityRole="header">
        NEEDS YOUR ATTENTION
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[3] }}
      >
        {shown.map((i, n) => (
          <Pressable
            key={i.key}
            accessibilityRole="link"
            accessibilityLabel={i.detail ? `${i.label}, ${i.detail}` : i.label}
            onPress={() => router.push(i.href as never)}
            style={chip(n === 0)}
          >
            <Icon name={ICON[i.kind]} size="sm" color={n === 0 ? c.accentInk : c.ink} />
            <View>
              <Text variant="bodyBold" style={n === 0 ? { color: c.accentInk } : undefined}>
                {i.label}
              </Text>
              {i.detail ? (
                <Text
                  variant="label"
                  muted={n !== 0}
                  style={n === 0 ? { color: c.accentInk } : undefined}
                >
                  {i.detail}
                </Text>
              ) : null}
            </View>
            <Icon name="caret-right" size="sm" color={n === 0 ? c.accentInk : c.ink} />
          </Pressable>
        ))}
        {more.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${more.length} more`}
            onPress={() => setOpen(true)}
            style={chip(false)}
          >
            <Text variant="bodyBold">+{more.length} more</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <Sheet open={open} onClose={() => setOpen(false)} title="Needs your attention">
        <ListGroup>
          {[...shown, ...more].map((i) => (
            <ListItem
              key={i.key}
              title={i.label}
              subtitle={i.detail}
              onPress={() => {
                setOpen(false);
                router.push(i.href as never);
              }}
            />
          ))}
        </ListGroup>
      </Sheet>
    </View>
  );
}
