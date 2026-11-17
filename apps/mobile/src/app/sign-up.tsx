import { APP_NAME } from '@athleit/core';

import { AuthForm } from '@/components/auth/auth-form';
import { Card, Screen, Text } from '@/components/ui';

export default function SignUpScreen() {
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <Text size="3xl" weight="bold">
        {APP_NAME}
      </Text>
      <Card style={{ gap: 20 }}>
        <Text size="2xl" weight="semibold">
          Create your account
        </Text>
        <AuthForm mode="sign-up" />
      </Card>
    </Screen>
  );
}
