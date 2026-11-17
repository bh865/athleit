import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/components/ui';
import '@/env'; // validate EXPO_PUBLIC_* at startup
import { AppProvider } from '@/lib/app-provider';
import { AuthProvider, useAuth } from '@/lib/auth';
import { fontAssets } from '@/lib/fonts';

// Where a signed-out user lands when they hit a guarded route.
export const unstable_settings = { anchor: 'sign-in' };

SplashScreen.preventAutoHideAsync().catch(() => {});
WebBrowser.maybeCompleteAuthSession();

function Routes() {
  const { session, initializing } = useAuth();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = (fontsLoaded || fontError) && !initializing;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Signed in: the app. Signed out: sign-in/sign-up (the first unguarded screen is where guests land). Expo Router redirects when `session` changes. */}
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      {/* Invite and player-login links work in either state: signed-out users are asked to sign in first. */}
      <Stack.Screen name="invite/[token]" />
      <Stack.Screen name="claim/[playerId]" />
      {/* Dev-only design smoke test, reachable in either state. */}
      <Stack.Screen name="smoke" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <StatusBar style="auto" />
            <Routes />
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
