import {
  getMyDevices,
  registerPushDevice,
  revokePushDevice,
  setActiveThread,
} from '@athleit/db/api';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** The Expo push token for this install, once registered (used to report the open thread and to sign out). */
let currentToken: string | null = null;
/** The conversation currently on screen; the foreground handler stays silent for it. */
let openThreadId: string | null = null;

export const getCurrentPushToken = () => currentToken;
export const setOpenThread = (id: string | null) => {
  openThreadId = id;
};

/** Foreground behaviour: show a banner unless it is for the thread you are looking at. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const data = n.request.content.data as { thread_id?: string } | undefined;
      const same = data?.thread_id !== undefined && data.thread_id === openThreadId;
      return {
        shouldShowBanner: !same,
        shouldShowList: !same,
        shouldPlaySound: !same,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Ask for permission and register this device. Returns null on success or a short sentence for
 * the settings screen. Needs an EAS project id (extra.eas.projectId) to mint a token.
 */
export async function enablePush(): Promise<string | null> {
  if (!Device.isDevice) return 'Push needs a real device (not the simulator).';
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return 'Push is not set up for this build yet.';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('schedule', {
      name: 'Schedule changes',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted')
    return 'Notifications are turned off for Athleit in your phone settings.';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const res = await registerPushDevice(supabase, {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    token,
    label: Device.modelName ?? Platform.OS,
  });
  if (res.error) return 'Could not register this device. Try again.';
  currentToken = token;
  return null;
}

/** Re-register on sign-in when permission was already granted (token rotation is handled here too). */
export async function refreshPush(): Promise<void> {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') await enablePush();
}

/** Revoke this device on logout so the next person on the phone does not receive your notifications. */
export async function revokeThisDevice(): Promise<void> {
  if (!currentToken) {
    // Not registered in this run; revoke any active device that matches a freshly derived token if possible.
    return;
  }
  await revokePushDevice(supabase, { token: currentToken });
  currentToken = null;
}

export const listMyDevices = () => getMyDevices(supabase);

/** Tell the delivery worker which thread is open on this device (null = none). */
export const reportOpenThread = (threadId: string | null) =>
  currentToken ? setActiveThread(supabase, currentToken, threadId) : Promise.resolve(null);
