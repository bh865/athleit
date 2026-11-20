import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, ToastProvider } from '@/components/ui';
import '@/env'; // validate EXPO_PUBLIC_* at startup
import { AppProvider } from '@/lib/app-provider';
import { AuthProvider, useAuth } from '@/lib/auth';
import { fontAssets } from '@/lib/fonts';

// Where a signed-out user lands when they hit a guarded route.
export const unstable_settings = { anchor: 'welcome' };

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
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* These work in either state: a link can arrive while the person is signed out (the account is
          created or the password reset on this very screen, so a new session must not unmount it). */}
      <Stack.Screen name="check-email" />
      <Stack.Screen name="auth/reset" />
      <Stack.Screen name="auth/callback" />
      {/* Invite and player-login links work in either state: signed-out users are asked to sign in first. */}
      <Stack.Screen name="invite/[token]" />
      <Stack.Screen name="claim/[playerId]" />
      {/* Dev-only design gallery, reachable in either state. */}
      <Stack.Screen name="design" />
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
            <ToastProvider>
              <Routes />
            </ToastProvider>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
