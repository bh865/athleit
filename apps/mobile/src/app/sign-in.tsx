import { fieldErrors, signInSchema, type FieldErrors, type OAuthProvider } from '@athleit/core';
import { componentTokens, space } from '@athleit/tokens';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import {
  AuthHeading,
  ConsentLine,
  LinkButton,
  PasswordField,
  SocialButtons,
} from '@/components/auth/auth-ui';
import { PendingLinkBanner } from '@/components/auth/link-banner';
import { Button, Logo, Screen, Text, TextField, type TextFieldInput } from '@/components/ui';
import { providerOrder } from '@/lib/auth-config';
import { useAuth } from '@/lib/auth';
import { webContactUrl } from '@/lib/help';

type Field = 'email' | 'password';

export default function SignInScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? auth.lastEmail ?? '';
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextFieldInput>(null);
  const passwordRef = useRef<TextFieldInput>(null);

  async function run(action: () => ReturnType<typeof auth.signIn>) {
    setBusy(true);
    setError(null);
    const res = await action().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(false);
    if (res.error) setError(res.error);
  }

  function submit() {
    setErrors({});
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const e = fieldErrors<Field>(parsed.error);
      setErrors(e);
      (e.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    void run(() => auth.signIn(parsed.data));
  }

  const hasSocial = providerOrder().length > 0;
  return (
    <Screen avoidKeyboard contentStyle={{ justifyContent: 'center' }}>
      <Logo variant="lockup" size={componentTokens.avatar.lg} />
      <View style={{ gap: space[6] }}>
        <PendingLinkBanner />
        <AuthHeading
          title="Sign in"
          subtitle={auth.sessionEnded ? 'You were signed out. Sign in to continue.' : undefined}
        />
        {hasSocial ? (
          <>
            <SocialButtons
              disabled={busy}
              onProvider={(p: OAuthProvider) => void run(() => auth.signInWithProvider(p))}
            />
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              or
            </Text>
          </>
        ) : null}
        <View style={{ gap: space[4] }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            inputRef={emailRef}
            error={errors.email}
          />
          <PasswordField
            value={password}
            onChangeText={setPassword}
            inputRef={passwordRef}
            error={errors.password}
            onSubmitEditing={submit}
          />
          <LinkButton title="Forgot password?" onPress={() => router.push('/forgot-password')} />
          <LinkButton title="Need help signing in?" onPress={() => void WebBrowser.openBrowserAsync(webContactUrl())} />
          <FormMessage error={error} />
          <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text variant="caption" muted>
            New here?
          </Text>
          <LinkButton title="Create an account" onPress={() => router.replace('/sign-up')} />
        </View>
        <ConsentLine />
      </View>
    </Screen>
  );
}
