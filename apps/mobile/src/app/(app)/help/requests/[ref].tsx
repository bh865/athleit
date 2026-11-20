import {
  getMySupportRequest,
  markSupportRead,
  markSupportSolved,
  rateSupportRequest,
  reopenSupportRequest,
  replyToSupportRequest,
  supportErrorCode,
} from '@athleit/db/support';
import { space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { LoadState, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, Card, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const MARK = { open: '●', waiting_on_requester: '▲', solved: '✓', closed: '■' } as const;
const WORD = {
  open: 'Open',
  waiting_on_requester: 'Waiting on you',
  solved: 'Solved',
  closed: 'Closed',
} as const;

export default function RequestScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  useScreenTitle(ref ?? 'Request');
  const { data, error, loading, reload } = useLoad(
    () => getMySupportRequest(supabase, String(ref)),
    [ref],
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (data) void markSupportRead(supabase, data.ref);
  }, [data]);

  async function act(fn: () => PromiseLike<{ error: { message?: string } | null }>, ok?: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.error) {
      const c = supportErrorCode(r.error);
      setMsg(
        c === 'rate_limited'
          ? 'You’re sending a lot of messages. Please wait a moment.'
          : c === 'request_closed'
            ? 'This request is closed. Start a new one and mention this reference.'
            : 'That didn’t go through. Your text is still here.',
      );
      return false;
    }
    if (ok) setMsg(ok);
    reload();
    return true;
  }

  return (
    <AppScreen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <LoadState loading={loading && !data} error={error} onRetry={reload}>
        {data ? (
          <View style={{ gap: space[3] }}>
            <Text variant="caption" muted>
              {MARK[data.status]} {WORD[data.status]}
            </Text>
            <Text variant="heading">{data.subject}</Text>
            {data.status === 'waiting_on_requester' ? (
              <Notice>Waiting on you. We’ve asked a question below.</Notice>
            ) : null}
            {data.held ? <Notice>We’ve received your request and are checking it.</Notice> : null}
            {data.messages.map((m) =>
              m.author_kind === 'system' ? (
                <Text key={m.id} variant="caption" muted>
                  {m.body}
                </Text>
              ) : (
                <Card key={m.id}>
                  <Text variant="bodyBold">
                    {m.author_kind === 'requester'
                      ? 'You'
                      : `${m.author_name ?? 'Support'}, Athleit Support`}
                  </Text>
                  <Text variant="caption" muted>
                    {new Date(m.created_at).toLocaleString()}
                  </Text>
                  <Text selectable>{m.body}</Text>
                </Card>
              ),
            )}
            {msg ? <Notice>{msg}</Notice> : null}
            {data.can_reply ? (
              <>
                <TextField
                  label="Reply"
                  value={text}
                  onChangeText={setText}
                  multiline
                  numberOfLines={4}
                  maxLength={5000}
                />
                <Button
                  title="Send reply"
                  loading={busy}
                  disabled={!text.trim()}
                  onPress={() =>
                    void act(() => replyToSupportRequest(supabase, data.ref, text.trim())).then(
                      (ok) => ok && setText(''),
                    )
                  }
                />
                {data.status !== 'solved' ? (
                  <Button
                    title="Mark as solved"
                    variant="secondary"
                    onPress={() =>
                      void act(() => markSupportSolved(supabase, data.ref), 'Marked solved.')
                    }
                  />
                ) : null}
              </>
            ) : null}
            {data.status === 'solved' ? (
              <View style={{ gap: space[2] }}>
                {data.can_reopen ? (
                  <Button
                    title="Reopen"
                    variant="secondary"
                    onPress={() =>
                      void act(() => reopenSupportRequest(supabase, data.ref), 'Reopened.')
                    }
                  />
                ) : null}
                {!data.satisfaction ? (
                  <>
                    <Text variant="bodyBold">Was this resolved?</Text>
                    <View style={{ flexDirection: 'row', gap: space[2] }}>
                      <Button
                        title="Yes"
                        variant="secondary"
                        onPress={() =>
                          void act(
                            () => rateSupportRequest(supabase, data.ref, 'yes'),
                            'Thanks for telling us.',
                          )
                        }
                      />
                      <Button
                        title="No"
                        variant="secondary"
                        onPress={() =>
                          void act(
                            () => rateSupportRequest(supabase, data.ref, 'no'),
                            'Thanks. Reply above if it’s still not fixed.',
                          )
                        }
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </LoadState>
    </AppScreen>
  );
}
