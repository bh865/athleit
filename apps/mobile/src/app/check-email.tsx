import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  View,
} from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { AuthHeading, LinkButton, ResendButton } from '@/components/auth/auth-ui';
import { Button, Icon, Screen, Text, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/**
 * "Check your email" for both a new account (confirmation link) and a password reset.
 * For a new account it continues by itself once the link was opened: on this device through the
 * auth state, or in the browser through a silent sign-in when the app comes back to the front.
 */
export default function CheckEmailScreen() {
  const { email = '', mode = 'signup' } = useLocalSearchParams<{ email?: string; mode?: string }>();
  const isReset = mode === 'reset';
  const router = useRouter();
  const auth = useAuth();
  const { theme } = useTheme();
  const [sentAt, setSentAt] = useState<number | null>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const left = useRef(false);

  // Never keep the sign-up password once this screen is gone.
  useEffect(() => () => auth.clearPendingSignUp(), [auth]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Confirmed on this device (the link opened the app) or in the browser (silent sign-in on return).
  const confirmed = !isReset && Boolean(auth.session);

  useEffect(() => {
    if (isReset) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void auth.continueAfterConfirmation();
    });
    return () => sub.remove();
  }, [auth, isReset]);

  useEffect(() => {
    if (!confirmed || left.current) return;
    left.current = true;
    const t = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(t);
  }, [confirmed, router]);

  async function resend() {
    setBusy(true);
    setError(null);
    const res = isReset
      ? await auth.requestPasswordReset(email)
      : await auth.resendConfirmation(email);
    setBusy(false);
    if (res.error) return setError(res.error);
    setSentAt(Date.now());
  }

  function openMail() {
    // iOS opens Mail directly; elsewhere (or if Mail is not installed) fall back to a blank message.
    const first = Platform.OS === 'ios' ? 'message://' : 'mailto:';
    Linking.openURL(first).catch(() => Linking.openURL('mailto:').catch(() => undefined));
  }

  if (confirmed) {
    return (
      <Screen contentStyle={{ justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="check-circle" size="lg" color={theme.color.ok} />
        <Text variant="title" accessibilityRole="header">
          You’re confirmed
        </Text>
        <Text muted>Taking you to the next step.</Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <View style={{ gap: space[6] }}>
        <AuthHeading title="Check your email" />
        {isReset ? (
          <Text>
            If an account exists for <Text variant="bodyBold">{email}</Text>, we sent a link to
            reset your password.
          </Text>
        ) : (
          <View style={{ gap: space[1] }}>
            <Text muted>We sent a confirmation link to</Text>
            <Text variant="bodyBold">{email}</Text>
          </View>
        )}
        {!isReset ? (
          <View
            accessible
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
          >
            {reduceMotion ? null : <ActivityIndicator color={theme.color.muted} />}
            <Text muted>Waiting for you to tap the link</Text>
          </View>
        ) : null}
        <FormMessage error={error} />
        <View style={{ gap: space[3] }}>
          <Button title="Open mail app" size="lg" icon="envelope-simple" onPress={openMail} />
          <ResendButton sentAt={sentAt} busy={busy} onResend={() => void resend()} />
        </View>
        {isReset ? (
          <LinkButton title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        ) : (
          <>
            <LinkButton
              title="Use a different email"
              onPress={() => {
                auth.clearPendingSignUp();
                router.replace('/sign-up');
              }}
            />
            <Text variant="caption" muted>
              Not there? Check spam.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
