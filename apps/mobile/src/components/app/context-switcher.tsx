import { contextPath, type AddRoleAction } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { initialsOf } from '@athleit/ui-core';

import { Glass, Icon, Sheet, Text, useTheme } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

const ADD: Record<AddRoleAction, { label: string; href: string }> = {
  'add-family': { label: 'Add a family', href: '/family/children/new' },
  'create-team': { label: 'Create a team', href: '/teams/new' },
  'create-club': { label: 'Create a club', href: '/clubs/new' },
  'join-team': { label: 'Join a team', href: '/join' },
};

/** Switch between roles and places ("Parent, family", "Coach, U10 Hawks", "Admin, Riverside"). */
export function ContextSwitcher() {
  const { contexts, active, setActive, addActions } = useApp();
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const go = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };

  return (
    <>
      <Pressable
        testID="context-switcher"
        accessibilityRole="button"
        accessibilityLabel={`Switch role. Current: ${active ? `${active.title}, ${active.subtitle}` : 'none'}`}
        onPress={() => setOpen(true)}
        style={{ flexShrink: 1 }}
      >
        {/* Glass pill per the design: lime initials circle, name, role, caret. */}
        <Glass
          level="bar"
          cornerRadius={radius.lg}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            minHeight: componentTokens.minTarget,
            paddingVertical: space[1],
            paddingLeft: space[1],
            paddingRight: space[3],
          }}
        >
          <View
            style={{
              width: componentTokens.avatar.sm,
              height: componentTokens.avatar.sm,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
            }}
          >
            <Text variant="bodyBold" style={{ color: c.accentInk }}>
              {initialsOf(active?.title ?? 'Athleit')}
            </Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text variant="bodyBold" numberOfLines={1}>
              {active?.title ?? 'Get started'}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {active?.subtitle ?? 'Choose a role'}
            </Text>
          </View>
          <Icon name="caret-down" size="sm" />
        </Glass>
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Switch role">
        <ScrollView
          style={{ maxHeight: componentTokens.sidebar.width * 2 }}
          contentContainerStyle={{ gap: space[1] }}
        >
          {contexts.map((ctx) => (
            <Pressable
              key={ctx.key}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: ctx.key === active?.key }}
              onPress={() => {
                setActive(ctx.key);
                go(contextPath(ctx));
              }}
              style={{
                minHeight: componentTokens.listRow.height,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                padding: space[3],
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{ctx.title}</Text>
                <Text variant="caption" muted>
                  {ctx.subtitle}
                </Text>
              </View>
              {ctx.key === active?.key ? <Icon name="check" weight="fill" size="sm" /> : null}
            </Pressable>
          ))}
          <Text
            variant="caption"
            muted
            style={{ marginTop: space[3], paddingHorizontal: space[3] }}
          >
            ADD A ROLE
          </Text>
          {addActions.map((a) => (
            <Pressable
              key={a}
              accessibilityRole="menuitem"
              onPress={() => go(ADD[a].href)}
              style={{
                minHeight: componentTokens.button.height,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                padding: space[3],
              }}
            >
              <Icon name="plus" size="sm" />
              <Text variant="bodyBold">{ADD[a].label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}
