'use client';

import {
  friendlyError,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  summarizePreferences,
} from '@athleit/core';
import {
  getMyDevices,
  getNotificationPreferences,
  revokePushDevice,
  saveNotificationPreference,
  saveQuietHours,
} from '@athleit/db/api';
import { useEffect, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { LoadState } from '@/components/app/states';
import { Button, Card, PageHeader, Select, Text, TimePicker, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';
import {
  currentEndpoint,
  disableWebPush,
  enableWebPush,
  VAPID_PUBLIC_KEY,
  webPushSupported,
} from '@/lib/web-push';

import styles from './settings.module.css';

const LABEL = {
  messages: 'Messages',
  announcements: 'Announcements',
  schedule: 'Schedule changes',
  payments: 'Payments',
  registration: 'Registrations and waivers',
} as const;
const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return ['UTC'];
  }
};

export default function NotificationSettings() {
  const { userId } = useApp();
  const toast = useToast();
  const client = getClient();
  const prefs = useLoad(
    () =>
      userId
        ? getNotificationPreferences(client, userId)
        : Promise.resolve({ data: [], error: null }),
    [userId],
  );
  const devices = useLoad(() => getMyDevices(client), []);
  const [here, setHere] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<{ start: string; end: string; tz: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void currentEndpoint().then(setHere);
  }, [devices.data]);

  const rows = prefs.data ?? [];
  const s = summarizePreferences(rows);
  const q = quiet ?? { start: s.quietStart, end: s.quietEnd, tz: s.timezone };

  const fail = (e: { message: string; code?: string | undefined }) =>
    toast(friendlyError(e), 'danger');

  async function toggle(
    channel: (typeof NOTIFICATION_CHANNELS)[number],
    category: (typeof NOTIFICATION_CATEGORIES)[number],
    enabled: boolean,
  ) {
    if (!userId) return;
    const key = `${channel}:${category}`;
    setLocal((cur) => ({ ...cur, [key]: enabled })); // optimistic: the switch moves at once
    const r = await saveNotificationPreference(client, userId, channel, category, { enabled });
    if (r.error) {
      fail(r.error);
      setLocal((cur) => {
        const { [key]: _gone, ...rest } = cur;
        return rest;
      });
    }
    prefs.reload();
  }
  async function saveQuiet() {
    if (!userId) return;
    setBusy(true);
    const r = await saveQuietHours(client, userId, {
      start: q.start || null,
      end: q.start ? q.end || null : null,
      timezone: q.tz,
    });
    setBusy(false);
    if (r.error) fail(r.error);
    else toast('Quiet hours saved');
    prefs.reload();
  }
  async function setPreview(on: boolean) {
    if (!userId) return;
    const results = await Promise.all(
      NOTIFICATION_CHANNELS.map((c) =>
        saveNotificationPreference(client, userId, c, 'messages', { include_preview: on }),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) fail(err);
    prefs.reload();
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Notification settings"
        back={{ href: '/notifications', label: 'Alerts' }}
      />

      <LoadState loading={prefs.loading} error={prefs.error} onRetry={prefs.reload}>
        <Card className={styles.card}>
          <Text variant="heading" as="h2">
            What to send
          </Text>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className="t-caption">
                  Category
                </th>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <th key={c} scope="col" className="t-caption">
                    {c === 'push' ? 'Push' : 'Email'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((cat) => (
                <tr key={cat}>
                  <th scope="row">{LABEL[cat]}</th>
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <td key={ch}>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={local[`${ch}:${cat}`] ?? s.get(ch, cat)}
                          onChange={(e) => void toggle(ch, cat, e.target.checked)}
                          aria-label={`${LABEL[cat]} by ${ch === 'push' ? 'push' : 'email'}`}
                        />
                        <span className={styles.track} aria-hidden />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Text variant="caption" muted as="p">
            Email is only used when you have no device set up for push.
          </Text>
        </Card>

        <Card className={styles.card}>
          <Text variant="heading" as="h2">
            Quiet hours
          </Text>
          <Text muted as="p">
            Notifications that arrive during quiet hours wait and are delivered when they end.
          </Text>
          <div className={styles.fields}>
            <TimePicker
              label="From"
              value={q.start}
              onChange={(v) => setQuiet({ ...q, start: v })}
            />
            <TimePicker label="Until" value={q.end} onChange={(v) => setQuiet({ ...q, end: v })} />
          </div>
          <Select
            label="Timezone"
            value={q.tz}
            onChange={(e) => setQuiet({ ...q, tz: e.target.value })}
            options={zones().map((z) => ({ value: z, label: z }))}
          />
          <Button loading={busy} onClick={() => void saveQuiet()}>
            Save quiet hours
          </Button>
        </Card>

        <Card className={styles.card}>
          <Text variant="heading" as="h2">
            Lock screen
          </Text>
          <label className={styles.inline}>
            <input
              type="checkbox"
              checked={s.preview}
              onChange={(e) => void setPreview(e.target.checked)}
            />
            <span>Show a message preview in notifications</span>
          </label>
          <Text variant="caption" muted as="p">
            Notifications about conversations that include players under 18 never show message text,
            whatever you choose.
          </Text>
        </Card>
      </LoadState>

      <Card className={styles.card}>
        <Text variant="heading" as="h2">
          Your devices
        </Text>
        <LoadState
          loading={devices.loading}
          error={devices.error}
          empty={(devices.data ?? []).length === 0}
          emptyText="No devices registered for push yet."
          onRetry={devices.reload}
        >
          <ul className={styles.devices} aria-label="Devices">
            {(devices.data ?? []).map((d) => (
              <li key={d.id} className={styles.device} data-testid="device-row">
                <span className={styles.deviceName}>
                  {d.device_label ?? d.platform}
                  {d.token === here ? ' (this browser)' : ''}
                </span>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (d.token === here) await disableWebPush(client);
                    else await revokePushDevice(client, { deviceId: d.id });
                    toast('Device signed out');
                    devices.reload();
                  }}
                >
                  Sign out this device
                </Button>
              </li>
            ))}
          </ul>
        </LoadState>
        {webPushSupported() && !here ? (
          <>
            <Button
              variant="secondary"
              disabled={!VAPID_PUBLIC_KEY}
              onClick={async () => {
                const err = await enableWebPush(client);
                if (err) toast(err, 'danger');
                else toast('Push turned on for this browser');
                devices.reload();
              }}
            >
              Turn on push in this browser
            </Button>
            {!VAPID_PUBLIC_KEY ? (
              <Text variant="caption" muted as="p">
                Browser push is not set up for this app yet.
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>
      <Text variant="caption" muted as="p">
        To mute one conversation, open it and use the bell in its header.
      </Text>
    </div>
  );
}
