import { readCodeInput, UNDER_13_COPY } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, Card, Text, TextField } from '@/components/ui';

/**
 * Player path (13 and older). A player links their own login from the link a parent or coach sends;
 * the claim screen then says whether they are linked or waiting for a parent.
 */
export default function PlayerPathScreen() {
  useScreenTitle('Link your login');
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  function go() {
    const input = readCodeInput(value);
    if (input.kind === 'claim') return router.push(`/claim/${input.playerId}` as never);
    if (input.kind === 'invite') return router.push(`/invite/${input.token}` as never);
    setError('Paste the link your parent or coach sent you.');
  }

  return (
    <AppScreen>
      <Card style={{ gap: space[4] }}>
        <H1>Players 13 and older sign in themselves</H1>
        <Text muted>Your parent or coach sends you a link. Open it, or paste it here.</Text>
        <TextField
          label="Link"
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(undefined);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
        />
        <Notice>{`Players under 13 don’t have their own login. A parent manages their account.`}</Notice>
        <Button title="Continue" size="lg" onPress={go} />
        <Button
          title="Ask your parent to send a link"
          variant="ghost"
          onPress={() =>
            void Share.share({
              message: 'Can you send me my Athleit link so I can sign in as a player?',
            })
          }
        />
        <Text variant="caption" muted>
          {UNDER_13_COPY}
        </Text>
      </Card>
    </AppScreen>
  );
}
