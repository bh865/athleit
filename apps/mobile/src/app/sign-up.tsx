import { fieldErrors, signUpSchema, type FieldErrors, type OAuthProvider } from '@athleit/core';
import { componentTokens, space } from '@athleit/tokens';
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
import { Button, Logo, Screen, Text, TextField, type TextFieldInput } from '@/components/ui';
import { providerOrder } from '@/lib/auth-config';
import { useAuth } from '@/lib/auth';

type Field = 'displayName' | 'email' | 'password';

export default function SignUpScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<TextFieldInput>(null);
  const emailRef = useRef<TextFieldInput>(null);
  const passwordRef = useRef<TextFieldInput>(null);

  async function run(action: () => ReturnType<typeof auth.signUp>) {
    setBusy(true);
    setError(null);
    const res = await action().catch(
      () => ({ error: 'Something went wrong. Try again.' }) as const,
    );
    setBusy(false);
    if (res.error) return setError(res.error);
    if ('needsConfirmation' in res && res.needsConfirmation) {
      router.push({
        pathname: '/check-email',
        params: { email: email.trim().toLowerCase(), mode: 'signup' },
      });
    }
  }

  function submit() {
    setErrors({});
    const parsed = signUpSchema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      const e = fieldErrors<Field>(parsed.error);
      setErrors(e);
      (e.displayName ? nameRef : e.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    void run(() => auth.signUp(parsed.data));
  }

  const hasSocial = providerOrder().length > 0;
  return (
    <Screen avoidKeyboard contentStyle={{ justifyContent: 'center' }}>
      <Logo variant="lockup" size={componentTokens.avatar.lg} />
      <View style={{ gap: space[6] }}>
        <AuthHeading title="Create your account" />
        {hasSocial ? (
          <>
            <SocialButtons
              disabled={busy}
              onProvider={(p: OAuthProvider) => {
                setBusy(true);
                setError(null);
                void auth.signInWithProvider(p).then((res) => {
                  setBusy(false);
                  if (res.error) setError(res.error);
                });
              }}
            />
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              or
            </Text>
          </>
        ) : null}
        <View style={{ gap: space[4] }}>
          <TextField
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            inputRef={nameRef}
            error={errors.displayName}
          />
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
            isNew
            value={password}
            onChangeText={setPassword}
            inputRef={passwordRef}
            error={errors.password}
            onSubmitEditing={submit}
          />
          <ConsentLine />
          <FormMessage error={error} />
          <Button title="Create account" size="lg" loading={busy} onPress={submit} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text variant="caption" muted>
            Already have an account?
          </Text>
          <LinkButton title="Sign in" onPress={() => router.replace('/sign-in')} />
        </View>
      </View>
    </Screen>
  );
}
