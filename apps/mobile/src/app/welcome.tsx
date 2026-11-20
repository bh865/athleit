import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { ConsentLine, LinkButton, SocialButtons } from '@/components/auth/auth-ui';
import { Button, Glass, Logo, Screen, Text } from '@/components/ui';
import { providerOrder } from '@/lib/auth-config';
import { useAuth } from '@/lib/auth';
import { kv, POST_AUTH_INTENT_KEY } from '@/lib/kv';

/** First screen when signed out: one primary action, the social option for the device, then email. */
export default function WelcomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSocial = providerOrder().length > 0;

  return (
    <Screen contentStyle={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] }}>
        <Glass
          level="sheet"
          cornerRadius={32}
          style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}
        >
          <Logo variant="mark" size={56} />
        </Glass>
        <Text variant="display" accessibilityRole="header">
          athleit
        </Text>
        <Text muted style={{ textAlign: 'center', maxWidth: 260 }}>
          Your team, your family, one place.
        </Text>
      </View>
      <View style={{ gap: space[3] }}>
        <FormMessage error={error} />
        <SocialButtons
          disabled={busy}
          onProvider={(p) => {
            setBusy(true);
            setError(null);
            void auth.signInWithProvider(p).then((res) => {
              setBusy(false);
              if (res.error) setError(res.error);
            });
          }}
        />
        <Button
          title="Continue with email"
          size="lg"
          icon="envelope-simple"
          variant={hasSocial ? 'secondary' : 'primary'}
          onPress={() => router.push('/sign-up')}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <LinkButton
            title="I have an invite or a code"
            onPress={() => {
              void kv.set(POST_AUTH_INTENT_KEY, 'code');
              router.push('/sign-up');
            }}
          />
          <LinkButton title="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
        <ConsentLine short />
      </View>
    </Screen>
  );
}
