import {
  fieldErrors,
  signInSchema,
  signUpSchema,
  type FieldErrors,
  type OAuthProvider,
} from '@athleit/core';
import { spacing } from '@athleit/tokens';
import { Link } from 'expo-router';
import { AppleLogo, GoogleLogo } from 'phosphor-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Text, TextField, useTheme } from '@/components/ui';
import { useAuth, type AuthResult } from '@/lib/auth';

type Field = 'displayName' | 'email' | 'password';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignUp = mode === 'sign-up';
  const { theme } = useTheme();
  const c = theme.color;
  const auth = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [result, setResult] = useState<AuthResult>({});
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<AuthResult>) {
    setBusy(true);
    setResult({});
    try {
      setResult(await action());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    setErrors({});
    if (isSignUp) {
      const parsed = signUpSchema.safeParse({ displayName, email, password });
      if (!parsed.success) return setErrors(fieldErrors<Field>(parsed.error));
      return run(() => auth.signUp(parsed.data));
    }
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors<Field>(parsed.error));
    return run(() => auth.signIn(parsed.data));
  }

  const provider = (p: OAuthProvider) => run(() => auth.signInWithProvider(p));

  return (
    <View style={{ gap: spacing[5] }}>
      <View style={{ gap: spacing[4] }}>
        {isSignUp && (
          <TextField
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoComplete="name"
            textContentType="name"
            error={errors.displayName}
          />
        )}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          textContentType={isSignUp ? 'newPassword' : 'password'}
          hint={isSignUp ? 'At least 8 characters' : undefined}
          error={errors.password}
          onSubmitEditing={submit}
        />
        {result.error ? (
          <View
            accessibilityRole="alert"
            style={{ padding: spacing[3], borderRadius: 12, backgroundColor: c.danger.bg }}
          >
            <Text size="sm" style={{ color: c.danger.text }}>
              {result.error}
            </Text>
          </View>
        ) : null}
        {result.message ? (
          <View style={{ padding: spacing[3], borderRadius: 12, backgroundColor: c.success.bg }}>
            <Text size="sm" style={{ color: c.success.text }}>
              {result.message}
            </Text>
          </View>
        ) : null}
        <Button title={isSignUp ? 'Create account' : 'Sign in'} loading={busy} onPress={submit} />
      </View>

      <Text size="sm" muted style={{ textAlign: 'center' }}>
        or
      </Text>

      {/* Google/Apple need real credentials in supabase/config.toml (see README). */}
      <View style={{ gap: spacing[3] }}>
        <Button
          title="Continue with Google"
          variant="secondary"
          disabled={busy}
          icon={<GoogleLogo size={20} weight="bold" color={c.text} />}
          onPress={() => provider('google')}
        />
        <Button
          title="Continue with Apple"
          variant="secondary"
          disabled={busy}
          icon={<AppleLogo size={20} weight="fill" color={c.text} />}
          onPress={() => provider('apple')}
        />
      </View>

      <Text size="sm" muted style={{ textAlign: 'center' }}>
        {isSignUp ? 'Already have an account? ' : 'New here? '}
        <Link
          href={isSignUp ? '/sign-in' : '/sign-up'}
          style={{ color: c.text, fontFamily: 'Manrope_600SemiBold' }}
        >
          {isSignUp ? 'Sign in' : 'Create an account'}
        </Link>
      </Text>
    </View>
  );
}
