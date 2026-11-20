import { componentTokens, space } from '@athleit/tokens';
import { usePathname } from 'expo-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

import { AppHeader } from './app-header';
import { BackLink } from './kit';
import { ErrorNotice, Loading } from './app-screen-states';

import { ScreenFooterContext } from './screen-footer';
import { ScreenTitleContext, type ScreenTitle } from './screen-title';

/** Screens that show the brand header (the rest are detail screens with a back button). */

const ROOT_PATHS = new Set([
  '/',
  '/schedule',
  '/messages',
  '/pay',
  '/family',
  '/notifications',
  '/more',
  '/roster',
]);

/** Signed-in screen frame: brand header on top (top-level screens), content, floating glass tab bar. */
export function AppScreen({
  children,
  refreshControl,
}: {
  children: ReactNode;
  /** Pull to refresh (pass a RefreshControl). */
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const { status } = useApp();
  const pathname = usePathname();
  const [screenTitle, setScreenTitle] = useState<ScreenTitle | null>(null);
  const [footer, setFooter] = useState<ReactNode>(null);
  const insets = useSafeAreaInsets();
  const isRoot = ROOT_PATHS.has(pathname);

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
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
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
      {/* The tab bar lives in the (app) layout so it stays put while screens slide. */}
    </Backdrop>
  );
}
