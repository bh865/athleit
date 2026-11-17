import { contextPath, type AddRoleAction } from '@athleit/core';
import { radii, spacing } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { CaretUpDown, Check, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Text, useTheme } from '@/components/ui';
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
        style={{
          flex: 1,
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2],
          paddingHorizontal: spacing[3],
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text size="sm" weight="semibold" numberOfLines={1}>
            {active?.title ?? 'Get started'}
          </Text>
          <Text size="xs" muted numberOfLines={1}>
            {active?.subtitle ?? 'Choose a role'}
          </Text>
        </View>
        <CaretUpDown size={20} color={c.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: '80%',
              padding: spacing[4],
              gap: spacing[2],
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              backgroundColor: c.surface,
            }}
          >
            <ScrollView contentContainerStyle={{ gap: spacing[1] }}>
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
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[3],
                    padding: spacing[3],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{ctx.title}</Text>
                    <Text size="sm" muted>
                      {ctx.subtitle}
                    </Text>
                  </View>
                  {ctx.key === active?.key ? (
                    <Check size={20} weight="bold" color={c.text} />
                  ) : null}
                </Pressable>
              ))}
              <Text
                size="xs"
                weight="semibold"
                muted
                style={{ marginTop: spacing[3], paddingHorizontal: spacing[3] }}
              >
                ADD A ROLE
              </Text>
              {addActions.map((a) => (
                <Pressable
                  key={a}
                  accessibilityRole="menuitem"
                  onPress={() => go(ADD[a].href)}
                  style={{
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[3],
                    padding: spacing[3],
                  }}
                >
                  <Plus size={20} color={c.text} />
                  <Text weight="semibold">{ADD[a].label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
