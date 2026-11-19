import { contextPath, switcherPlaces, type AddRoleAction } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { initialsOf } from '@athleit/ui-core';

import { Glass, Icon, Sheet, Text, useTheme } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

export const ADD: Record<AddRoleAction, { label: string; href: string }> = {
  'add-family': { label: 'Add a family', href: '/family/children/new' },
  'create-team': { label: 'Create a team', href: '/teams/new' },
  'create-club': { label: 'Create a club', href: '/clubs/new' },
  'join-team': { label: 'Join a team', href: '/join' },
};

/**
 * Switch between PLACES (teams and clubs); roles are a label ("Admin · Parent"). One place = a static
 * pill with no sheet. "Add a team / club / family" also lives in More for single-place users.
 */
export function ContextSwitcher() {
  const { contexts, active, setActive } = useApp();
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const places = switcherPlaces(contexts);
  const single = places.length <= 1;

  const go = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };

  return (
    <>
      <Pressable
        testID="context-switcher"
        accessibilityRole={single ? 'text' : 'button'}
        accessibilityLabel={
          single
            ? `${active ? `${active.title}, ${active.subtitle}` : 'Get started'}`
            : `Switch team. Current: ${active ? `${active.title}, ${active.subtitle}` : 'none'}`
        }
        disabled={single}
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
              {active?.subtitle ?? 'Add a team or family in More'}
            </Text>
          </View>
          {single ? null : <Icon name="caret-down" size="sm" />}
        </Glass>
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Switch team">
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: componentTokens.sidebar.width * 2 }}
          contentContainerStyle={{ gap: space[1] }}
        >
          {places.map((ctx) => (
            <Pressable
              key={ctx.key}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: ctx.key === active?.key }}
              onPress={() => {
                setActive(ctx.key);
                // Teams: stay put; the current screen re-reads the newly active team. Only a screen
                // that belongs to one specific team/club (its route would fight the switch) goes Home.
                if (ctx.kind !== 'team') go(contextPath(ctx));
                else if (pathname.startsWith('/teams/') || pathname.startsWith('/clubs/')) go('/');
                else setOpen(false);
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
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}
