import { getMyDevices, registerPushDevice, revokePushDevice, type Client } from '@athleit/db/api';

/** Public VAPID key (safe to ship). Without it web push is simply unavailable. */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const webPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentEndpoint(): Promise<string | null> {
  if (!webPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/** Ask permission, subscribe this browser and register it as a device. Returns an error sentence or null. */
export async function enableWebPush(client: Client): Promise<string | null> {
  if (!webPushSupported()) return 'This browser does not support notifications.';
  if (!VAPID_PUBLIC_KEY) return 'Web push is not set up yet for this app.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    return 'Notifications are blocked for this site in your browser settings.';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    return 'Could not read the browser subscription.';
  const res = await registerPushDevice(client, {
    platform: 'web',
    token: json.endpoint,
    subscription: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    label: `${navigator.platform || 'Browser'} (web)`,
  });
  return res.error ? 'Could not register this browser. Try again.' : null;
}

/** Sign this device out of push: revoke the registration and drop the browser subscription. */
export async function disableWebPush(client: Client): Promise<void> {
  const endpoint = await currentEndpoint();
  if (endpoint) await revokePushDevice(client, { token: endpoint });
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
}

/** Re-register on sign-in so a returning user's browser keeps receiving pushes. */
export async function refreshWebPush(client: Client) {
  const endpoint = await currentEndpoint();
  if (!endpoint || Notification.permission !== 'granted') return;
  const devices = await getMyDevices(client);
  if (!devices.data?.some((d) => d.token === endpoint)) await enableWebPush(client);
}
