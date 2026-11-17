import { calendarFeedUrl, friendlyError } from '@athleit/core';
import {
  createFeedToken,
  getFeedTokenStatus,
  revokeFeedToken,
  rotateFeedToken,
} from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { Button, Sheet, Text, useToast } from '@/components/ui';
import { env } from '@/env';
import { supabase } from '@/lib/supabase';

/** Create, copy, reset and turn off the private calendar subscription link. Shown once; only a hash is stored. */
export function CalendarFeedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let live = true;
    void getFeedTokenStatus(supabase).then((r) => live && setActive((r.data ?? []).length > 0));
    return () => {
      live = false;
    };
  }, [open]);

  async function act(kind: 'create' | 'rotate' | 'revoke') {
    setBusy(true);
    setError(null);
    if (kind === 'revoke') {
      const r = await revokeFeedToken(supabase);
      setBusy(false);
      if (r.error) return setError(friendlyError(r.error));
      setUrl(null);
      setActive(false);
      return toast('Calendar link turned off');
    }
    const r = kind === 'create' ? await createFeedToken(supabase) : await rotateFeedToken(supabase);
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setUrl(calendarFeedUrl(env.url, r.data));
    setActive(true);
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setUrl(null);
        onClose();
      }}
      title="Calendar link"
    >
      <View style={{ gap: space[4] }}>
        <Text variant="heading">Calendar link</Text>
        <Text muted>
          Subscribe in Apple Calendar or Google Calendar to see every team’s schedule there. Anyone
          with the link can see it, so keep it private.
        </Text>
        {url ? (
          <>
            <Text variant="mono" selectable testID="feed-url">
              {url}
            </Text>
            <Button
              title="Copy link"
              icon="copy"
              onPress={() => void Clipboard.setStringAsync(url).then(() => toast('Link copied'))}
            />
            <Text variant="caption" muted>
              This is the only time the link is shown. Copy it now.
            </Text>
          </>
        ) : active ? (
          <Text>
            A calendar link is on. To get a new link, reset it; the old one stops working.
          </Text>
        ) : (
          <Button
            title="Create calendar link"
            onPress={() => void act('create')}
            loading={busy}
            disabled={active === null}
          />
        )}
        {active || url ? (
          <View style={{ gap: space[2] }}>
            <Button
              title="Reset link"
              icon="arrow-clockwise"
              variant="secondary"
              onPress={() => void act('rotate')}
              loading={busy}
            />
            <Button
              title="Turn off"
              variant="ghost"
              onPress={() => void act('revoke')}
              disabled={busy}
            />
          </View>
        ) : null}
        <FormMessage error={error} />
      </View>
    </Sheet>
  );
}
