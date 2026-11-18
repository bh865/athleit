import {
  friendlyError,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  summarizePreferences,
} from '@athleit/core';
import {
  getNotificationPreferences,
  revokePushDevice,
  saveNotificationPreference,
  saveQuietHours,
} from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, H2, Notice } from '@/components/app/kit';
import { Button, Card, Text, TextField, useTheme, useToast } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { enablePush, getCurrentPushToken, listMyDevices } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const LABEL = {
  messages: 'Messages',
  announcements: 'Announcements',
  schedule: 'Schedule changes',
  payments: 'Payments',
} as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export default function NotificationSettingsScreen() {
  const { userId } = useApp();
  const { theme } = useTheme();
  const toast = useToast();
  const prefs = useLoad(
    () =>
      userId
        ? getNotificationPreferences(supabase, userId)
        : Promise.resolve({ data: [], error: null }),
    [userId],
  );
  const devices = useLoad(() => listMyDevices(), []);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const s = summarizePreferences(prefs.data ?? []);
  const q = quiet ?? { start: s.quietStart, end: s.quietEnd };
  const here = getCurrentPushToken();
  const fail = (e: { message: string; code?: string | undefined }) =>
    toast(friendlyError(e), 'danger');

  async function toggle(
    channel: (typeof NOTIFICATION_CHANNELS)[number],
    category: (typeof NOTIFICATION_CATEGORIES)[number],
    enabled: boolean,
  ) {
    if (!userId) return;
    const key = `${channel}:${category}`;
    setLocal((cur) => ({ ...cur, [key]: enabled }));
    const r = await saveNotificationPreference(supabase, userId, channel, category, { enabled });
    if (r.error) {
      fail(r.error);
      setLocal((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== key)));
    }
    prefs.reload();
  }

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        <H1>Notification settings</H1>
        <Card style={{ gap: space[3] }}>
          <H2>What to send</H2>
          {NOTIFICATION_CATEGORIES.map((cat) => (
            <View key={cat} style={{ gap: space[1] }}>
              <Text variant="bodyBold">{LABEL[cat]}</Text>
              {NOTIFICATION_CHANNELS.map((ch) => (
                <View
                  key={ch}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: space[12],
                  }}
                >
                  <Text>{ch === 'push' ? 'Push' : 'Email'}</Text>
                  <Switch
                    accessibilityLabel={`${LABEL[cat]} by ${ch}`}
                    value={local[`${ch}:${cat}`] ?? s.get(ch, cat)}
                    onValueChange={(v) => void toggle(ch, cat, v)}
                    trackColor={{ true: theme.color.bubbleOwn, false: theme.color.line }}
                    thumbColor={theme.color.surface}
                  />
                </View>
              ))}
            </View>
          ))}
          <Text variant="caption" muted>
            Email is only used when you have no device set up for push.
          </Text>
        </Card>

        <Card style={{ gap: space[3] }}>
          <H2>Quiet hours</H2>
          <Text muted>
            Notifications that arrive during quiet hours wait and are delivered when they end.
            Timezone: {deviceZone()}.
          </Text>
          <TextField
            label="From (HH:MM)"
            value={q.start}
            onChangeText={(v) => setQuiet({ ...q, start: v })}
            placeholder="21:00"
            keyboardType="numbers-and-punctuation"
            mono
          />
          <TextField
            label="Until (HH:MM)"
            value={q.end}
            onChangeText={(v) => setQuiet({ ...q, end: v })}
            placeholder="07:00"
            keyboardType="numbers-and-punctuation"
            mono
          />
          <Button
            title="Save quiet hours"
            loading={busy}
            onPress={async () => {
              if (!userId) return;
              const clear = q.start.trim() === '' && q.end.trim() === '';
              if (!clear && !(TIME.test(q.start) && TIME.test(q.end)))
                return toast('Use 24-hour times like 21:00', 'danger');
              setBusy(true);
              const r = await saveQuietHours(supabase, userId, {
                start: clear ? null : q.start,
                end: clear ? null : q.end,
                timezone: deviceZone(),
              });
              setBusy(false);
              if (r.error) fail(r.error);
              else toast('Quiet hours saved');
              prefs.reload();
            }}
          />
        </Card>

        <Card style={{ gap: space[3] }}>
          <H2>Lock screen</H2>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space[3],
            }}
          >
            <Text style={{ flex: 1 }}>Show a message preview in notifications</Text>
            <Switch
              accessibilityLabel="Show a message preview"
              value={s.preview}
              onValueChange={async (v) => {
                if (!userId) return;
                await Promise.all(
                  NOTIFICATION_CHANNELS.map((c) =>
                    saveNotificationPreference(supabase, userId, c, 'messages', {
                      include_preview: v,
                    }),
                  ),
                );
                prefs.reload();
              }}
              trackColor={{ true: theme.color.bubbleOwn, false: theme.color.line }}
              thumbColor={theme.color.surface}
            />
          </View>
          <Text variant="caption" muted>
            Notifications about conversations that include players under 18 never show message text,
            whatever you choose.
          </Text>
        </Card>

        <Card style={{ gap: space[3] }}>
          <H2>Your devices</H2>
          {(devices.data ?? []).length === 0 ? (
            <Text muted>No devices registered for push yet.</Text>
          ) : null}
          {(devices.data ?? []).map((d) => (
            <View
              key={d.id}
              testID="device-row"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space[2],
              }}
            >
              <Text variant="bodyBold" style={{ flex: 1 }}>
                {d.device_label ?? d.platform}
                {d.token === here ? ' (this phone)' : ''}
              </Text>
              <Button
                title="Sign out this device"
                variant="ghost"
                onPress={async () => {
                  await revokePushDevice(supabase, { deviceId: d.id });
                  toast('Device signed out');
                  devices.reload();
                }}
              />
            </View>
          ))}
          <Button
            title="Turn on push on this phone"
            variant="secondary"
            onPress={async () => {
              const err = await enablePush();
              setPushError(err);
              if (!err) toast('Push turned on');
              devices.reload();
            }}
          />
          {pushError ? <Notice tone="error">{pushError}</Notice> : null}
        </Card>
        <Text variant="caption" muted>
          To mute one conversation, open it and use the bell in its header.
        </Text>
      </View>
    </AppScreen>
  );
}
