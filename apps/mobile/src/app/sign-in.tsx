import { APP_NAME } from '@athleit/core';
import { Link } from 'expo-router';

import { AuthForm } from '@/components/auth/auth-form';
import { Card, Screen, Text } from '@/components/ui';

export default function SignInScreen() {
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <Text size="3xl" weight="bold">
        {APP_NAME}
      </Text>
      <Card style={{ gap: 20 }}>
        <Text size="2xl" weight="semibold">
          Sign in
        </Text>
        <AuthForm mode="sign-in" />
      </Card>
      {__DEV__ ? (
        <Link href="/smoke" style={{ textAlign: 'center', textDecorationLine: 'underline' }}>
          <Text size="sm">Design smoke test</Text>
        </Link>
      ) : null}
    </Screen>
  );
}
