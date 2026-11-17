import { componentTokens, space } from '@athleit/tokens';

import { AuthForm } from '@/components/auth/auth-form';
import { Card, Logo, Screen, Text } from '@/components/ui';

export default function SignUpScreen() {
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <Logo variant="lockup" size={componentTokens.avatar.lg} />
      <Card style={{ gap: space[6] }}>
        <Text variant="title">Create your account</Text>
        <AuthForm mode="sign-up" />
      </Card>
    </Screen>
  );
}
