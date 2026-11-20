import { emailSchema } from '@athleit/core';
import { componentTokens, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { AuthHeading, LinkButton } from '@/components/auth/auth-ui';
import { Button, Logo, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? auth.lastEmail ?? '';
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFieldError(undefined);
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message);
    setBusy(true);
    const res = await auth.requestPasswordReset(parsed.data);
    setBusy(false);
    if (res.error) return setError(res.error);
    router.replace({ pathname: '/check-email', params: { email: parsed.data, mode: 'reset' } });
  }

  return (
    <Screen avoidKeyboard contentStyle={{ justifyContent: 'center' }}>
      <Logo variant="lockup" size={componentTokens.avatar.lg} />
      <View style={{ gap: space[6] }}>
        <AuthHeading
          title="Reset your password"
          subtitle="Enter your email and we’ll send you a link."
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
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          error={fieldError}
        />
        <FormMessage error={error} />
        <Button title="Send reset link" size="lg" loading={busy} onPress={() => void submit()} />
        <LinkButton title="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
