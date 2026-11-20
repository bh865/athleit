import { authCopy } from '@athleit/core';
import { space } from '@athleit/tokens';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { AuthHeading, LinkButton } from '@/components/auth/auth-ui';
import { Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { readLinkParams } from '@/lib/link-params';

/** Email-confirmation link (athleit://auth/callback?code=…). OAuth returns are handled in lib/auth. */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const url = Linking.useLinkingURL();
  const [exchangeFailed, setFailed] = useState(false);
  const params = useMemo(() => readLinkParams(url), [url]);
  const failed = exchangeFailed || (Boolean(url) && !params.code);
  const done = useRef<string | null>(null);

  useEffect(() => {
    const code = params.code;
    if (!code || done.current === code) return;
    done.current = code;
    void auth.exchangeCode(code).then((res) => {
      if (res.error) setFailed(true);
      else router.replace('/');
    });
  }, [params, auth, router]);

  if (!failed) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <Text muted accessibilityLiveRegion="polite">
          Signing you in…
        </Text>
      </Screen>
    );
  }
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <View style={{ gap: space[6] }}>
        <AuthHeading title="We couldn’t confirm that link" subtitle={authCopy('link_expired')} />
        <Button title="Back to sign in" size="lg" onPress={() => router.replace('/sign-in')} />
        <LinkButton title="Create an account" onPress={() => router.replace('/sign-up')} />
      </View>
    </Screen>
  );
}
