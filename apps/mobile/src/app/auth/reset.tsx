import { changePasswordSchema, fieldErrors, authCopy, type FieldErrors } from '@athleit/core';
import { space } from '@athleit/tokens';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { AuthHeading, LinkButton, PasswordField } from '@/components/auth/auth-ui';
import { Button, Icon, Screen, Text, useTheme, type TextFieldInput } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { readLinkParams } from '@/lib/link-params';

type Phase = 'checking' | 'ready' | 'expired' | 'done';

/**
 * Landing for the password-reset link (athleit://auth/reset or the athleit.app universal link).
 * Exchanges the one-time code, asks for a new password, then leaves the person signed in.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { theme } = useTheme();
  const url = Linking.useLinkingURL();
  const [exchangePhase, setPhase] = useState<Phase>('checking');
  const params = useMemo(() => readLinkParams(url), [url]);
  const badLink = Boolean(url) && Boolean(params.error || params.error_code || !params.code);
  const phase: Phase = badLink ? 'expired' : exchangePhase;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'next' | 'confirm'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exchanged = useRef<string | null>(null);
  const nextRef = useRef<TextFieldInput>(null);
  const confirmRef = useRef<TextFieldInput>(null);

  useEffect(() => {
    const code = params.code;
    if (!url || badLink || !code || exchanged.current === code) return;
    exchanged.current = code;
    void auth.exchangeCode(code).then((res) => setPhase(res.error ? 'expired' : 'ready'));
  }, [url, params, badLink, auth]);

  async function submit() {
    setErrors({});
    setError(null);
    const parsed = changePasswordSchema.safeParse({
      next: password,
      confirm,
      hasPassword: false,
    });
    if (!parsed.success) {
      const e = fieldErrors<'next' | 'confirm'>(parsed.error);
      setErrors(e);
      (e.next ? nextRef : confirmRef).current?.focus();
      return;
    }
    setBusy(true);
    const res = await auth.updatePassword(parsed.data.next);
    setBusy(false);
    if (res.error) return setError(res.error);
    setPhase('done');
  }

  if (phase === 'checking') {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <Text muted accessibilityLiveRegion="polite">
          Checking your link…
        </Text>
      </Screen>
    );
  }

  if (phase === 'expired') {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <View style={{ gap: space[6] }}>
          <AuthHeading
            title="This link has expired"
            subtitle="Reset links work once and expire after an hour. Ask for a new one."
          />
          <Button
            title="Send a new link"
            size="lg"
            onPress={() => router.replace('/forgot-password')}
          />
          <LinkButton title="Back to sign in" onPress={() => router.replace('/sign-in')} />
          <Text variant="caption" muted>
            {authCopy('link_expired')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <View style={{ gap: space[6], alignItems: 'flex-start' }}>
          <Icon name="check-circle" size="lg" color={theme.color.ok} />
          <AuthHeading title="Password updated" subtitle="You’re signed in on this device." />
          <Button title="Continue" size="lg" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard contentStyle={{ justifyContent: 'center' }}>
      <View style={{ gap: space[6] }}>
        <AuthHeading
          title="Set a new password"
          subtitle="Choose a password you don’t use anywhere else."
        />
        <PasswordField
          label="New password"
          isNew
          value={password}
          onChangeText={setPassword}
          inputRef={nextRef}
          error={errors.next}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordField
          label="Confirm new password"
          isNew
          value={confirm}
          onChangeText={setConfirm}
          inputRef={confirmRef}
          error={errors.confirm}
          onSubmitEditing={() => void submit()}
        />
        <FormMessage error={error} />
        <Button title="Update password" size="lg" loading={busy} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}
