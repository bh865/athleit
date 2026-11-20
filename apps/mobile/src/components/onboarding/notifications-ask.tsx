import { shouldAskForNotifications } from '@athleit/core';
import { space } from '@athleit/tokens';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import { Button, Sheet, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { kv, NOTIF_ASKED_KEY } from '@/lib/kv';
import { enablePush } from '@/lib/push';

/**
 * Soft-ask, shown once after the person first has a place, never at sign-up. "Not now" is remembered.
 * Nothing is requested from the system until they tap Turn on notifications.
 */
export function NotificationsAsk() {
  const { contexts } = useApp();
  const hasPlace = contexts.length > 0;
  const [asked, setAsked] = useState<boolean | null>(null);
  const [undetermined, setUndetermined] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([kv.get(NOTIF_ASKED_KEY), Notifications.getPermissionsAsync()])
      .then(([v, p]) => {
        setAsked(v === '1');
        setUndetermined(p.status === 'undetermined');
      })
      .catch(() => setAsked(true));
  }, []);

  const should =
    asked !== null && undetermined && shouldAskForNotifications({ hasPlace, alreadyAsked: asked });
  const open = should && !closed;

  function dismiss() {
    setClosed(true);
    setAsked(true);
    void kv.set(NOTIF_ASKED_KEY, '1');
  }

  async function turnOn() {
    const problem = await enablePush();
    if (problem) return setError(problem);
    dismiss();
  }

  return (
    <Sheet open={open} onClose={dismiss} title="Get a heads-up when practice moves">
      <View style={{ gap: space[3] }}>
        <Text variant="heading">Get a heads-up when practice moves</Text>
        <Text>Schedule changes</Text>
        <Text>Messages from your coach</Text>
        <Text>Game day reminders</Text>
        <Text variant="caption" muted>
          You can change this any time in Account.
        </Text>
        <FormMessage error={error} />
        <Button title="Turn on notifications" size="lg" onPress={() => void turnOn()} />
        <Button title="Not now" variant="ghost" onPress={dismiss} />
      </View>
    </Sheet>
  );
}
