import { friendlyError, joinCodeSchema } from '@athleit/core';
import { listChildren, requestToJoin } from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { Choice, FormMessage, H1, Notice } from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

export default function JoinScreen() {
  const { player } = useLocalSearchParams<{ player?: string }>();
  const children = useLoad(() => listChildren(supabase), []);
  const [code, setCode] = useState('');
  const [playerId, setPlayerId] = useState<string>(player ?? '');
  const [message, setMessage] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = joinCodeSchema.safeParse(code);
    if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
    setCodeError(undefined);
    setError(null);
    setBusy(true);
    const res = await requestToJoin(supabase, {
      teamCode: parsed.data,
      playerId: playerId || null,
      message: message.trim() || null,
    });
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSent(true);
  }

  if (sent) {
    return (
      <AppScreen>
        <Card style={{ gap: spacing[3] }} testID="join-sent">
          <H1>Request sent</H1>
          <Text>
            The team’s staff will review it. You’ll see the team here once they approve; until then
            you can’t see any of its information.
          </Text>
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Card style={{ gap: spacing[4] }}>
        <H1>Join a team</H1>
        <Text muted>
          Enter the team code from your coach. This sends a request; the team’s staff approve it
          before you get any access.
        </Text>
        <TextField
          label="Team code"
          mono
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          error={codeError}
        />
        {children.data && children.data.length > 0 ? (
          <Choice
            label="Which child is this for?"
            value={playerId}
            onChange={setPlayerId}
            options={[
              { value: '', label: 'No child (I’m a parent)' },
              ...children.data.map((c) => ({ value: c.id, label: c.first_name })),
            ]}
          />
        ) : (
          <Notice>Add your child first if this is for them.</Notice>
        )}
        <TextField
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          maxLength={500}
        />
        <FormMessage error={error} />
        <Button title="Send request" loading={busy} onPress={() => void submit()} />
      </Card>
    </AppScreen>
  );
}
