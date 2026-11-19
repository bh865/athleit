import { capabilitiesForPlace, payViewsFor } from '@athleit/core';
import { componentTokens, space } from '@athleit/tokens';
import { usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, Button, Sheet, TabBar, Text, ThemeToggle, type TabItem } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

import { ADD } from './context-switcher';
import { useAuth } from '@/lib/auth';
import { useUnread } from '@/lib/use-unread';

import { AppHeader } from './app-header';
import { BackLink } from './kit';
import { ErrorNotice, Loading } from './app-screen-states';

import { ScreenFooterContext } from './screen-footer';
import { ScreenTitleContext, type ScreenTitle } from './screen-title';

/** Screens that show the brand header (the rest are detail screens with a back button). */

const ROOT_PATHS = new Set(['/', '/schedule', '/messages', '/pay', '/family', '/notifications']);

/** Signed-in screen frame: brand header on top (top-level screens), content, floating glass tab bar. */
export function AppScreen({ children }: { children: ReactNode }) {
  const { status, contexts, active: place, userId, addActions } = useApp();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [screenTitle, setScreenTitle] = useState<ScreenTitle | null>(null);
  const [footer, setFooter] = useState<ReactNode>(null);
  const insets = useSafeAreaInsets();
  const isRoot = ROOT_PATHS.has(pathname);

  const hasFamily = contexts.some((c) => c.kind === 'family');
  const hasTeam = contexts.some((c) => c.kind === 'team');
  const pv = payViewsFor(contexts, null);
  const showPay = pv.payer;
  // Team details (members, invites, settings...) are staff only; the active team decides which one.
  const settingsTeamId =
    place?.kind === 'team' && capabilitiesForPlace(contexts, 'team', place.id).has('team.details')
      ? place.id
      : null;
  const unread = useUnread(userId, hasTeam);
  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: 'house' },
    ...(contexts.length > 0
      ? [{ key: 'schedule', label: 'Schedule', icon: 'calendar-blank' } as TabItem]
      : []),
    ...(hasTeam
      ? [{ key: 'messages', label: 'Messages', icon: 'chat-circle', badge: unread } as TabItem]
      : []),
    ...(showPay ? [{ key: 'pay', label: 'Pay', icon: 'credit-card' } as TabItem] : []),
    ...(hasFamily ? [{ key: 'family', label: 'Family', icon: 'house-line' } as TabItem] : []),
    { key: 'more', label: 'More', icon: 'dots-three-circle' },
  ];
  const showTabs = tabs.length > 5 ? tabs.filter((t) => t.key !== 'family') : tabs;
  const active = more
    ? 'more'
    : pathname.startsWith('/schedule') || pathname.startsWith('/events')
      ? 'schedule'
      : pathname.startsWith('/messages')
        ? 'messages'
        : pathname.startsWith('/pay')
          ? 'pay'
          : pathname.startsWith('/family')
            ? 'family'
            : pathname === '/'
              ? 'home'
              : null;

  return (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top-level screens get the brand header; detail screens start with a round back button. */}
        {isRoot && status === 'ready' ? (
          <View style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
            <AppHeader />
          </View>
        ) : null}
        {!isRoot && status === 'ready' ? (
          <View
            style={{
              paddingHorizontal: space[4],
              paddingTop: space[2],
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
            }}
          >
            <BackLink />
            {screenTitle ? (
              <View style={{ flex: 1 }} accessibilityRole="header">
                <Text variant="heading" numberOfLines={1}>
                  {screenTitle.title}
                </Text>
                {screenTitle.subtitle ? (
                  <Text variant="caption" muted numberOfLines={1}>
                    {screenTitle.subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space[4],
            gap: space[6],
            flexGrow: 1,
            paddingBottom: space[12] * 3,
          }}
        >
          <ScreenFooterContext value={setFooter}>
            <ScreenTitleContext value={setScreenTitle}>
              {status === 'error' ? <ErrorNotice /> : status !== 'ready' ? <Loading /> : children}
            </ScreenTitleContext>
          </ScreenFooterContext>
        </ScrollView>
      </SafeAreaView>
      {footer ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            // Sits just above the floating tab bar.
            bottom: insets.bottom + space[2] * 2 + componentTokens.tabBar.height,
            paddingHorizontal: space[4],
          }}
        >
          {footer}
        </View>
      ) : null}
      <TabBar
        items={showTabs}
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
                    : key === 'pay'
                      ? '/pay'
                      : '/family',
            );
        }}
      />
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <Text variant="heading">More</Text>
        {hasTeam ? (
          <Button
            title="Roster"
            variant="secondary"
            icon="users-three"
            onPress={() => {
              setMore(false);
              router.push('/roster' as never);
            }}
          />
        ) : null}
        {settingsTeamId ? (
          <Button
            title="Settings"
            variant="secondary"
            icon="gear"
            onPress={() => {
              setMore(false);
              router.push(`/teams/${settingsTeamId}` as never);
            }}
          />
        ) : null}
        {hasFamily ? (
          <Button
            title="Family"
            variant="secondary"
            onPress={() => {
              setMore(false);
              router.push('/family' as never);
            }}
          />
        ) : null}
        {hasFamily ? (
          <Button
            title="Registrations"
            variant="secondary"
            icon="clipboard-text"
            onPress={() => {
              setMore(false);
              router.push('/registrations' as never);
            }}
          />
        ) : null}
        <Button
          title="Alerts"
          variant="secondary"
          icon="bell"
          onPress={() => {
            setMore(false);
            router.push('/notifications' as never);
          }}
        />
        {addActions.map((a) => (
          <Button
            key={a}
            title={ADD[a].label}
            variant="ghost"
            icon="plus"
            onPress={() => {
              setMore(false);
              router.push(ADD[a].href as never);
            }}
          />
        ))}
        <ThemeToggle />
        <Button title="Sign out" variant="ghost" icon="sign-out" onPress={() => void signOut()} />
      </Sheet>
    </Backdrop>
  );
}
