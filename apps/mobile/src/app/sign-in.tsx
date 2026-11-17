import { componentTokens, space } from '@athleit/tokens';
import { Link } from 'expo-router';

import { AuthForm } from '@/components/auth/auth-form';
import { Card, Logo, Screen, Text } from '@/components/ui';

export default function SignInScreen() {
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <Logo variant="lockup" size={componentTokens.avatar.lg} />
      <Card style={{ gap: space[6] }}>
        <Text variant="title">Sign in</Text>
        <AuthForm mode="sign-in" />
      </Card>
      {__DEV__ ? (
        <Link href="/design" style={{ textAlign: 'center', textDecorationLine: 'underline' }}>
          <Text variant="caption">Design gallery</Text>
        </Link>
      ) : null}
    </Screen>
  );
}
