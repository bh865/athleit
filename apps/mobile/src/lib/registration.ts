import type { EdgeConfig } from '@athleit/db/registration';
import * as WebBrowser from 'expo-web-browser';

import { env } from '@/env';
import { supabase } from '@/lib/supabase';

export const edgeConfig: EdgeConfig = { url: env.url, anonKey: env.anonKey };
export const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? '';

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Human check: opens the web captcha page in the in-app browser, which returns the token through athleit://captcha.
 * Returns null when the person cancels or the check fails.
 */
export async function solveCaptcha(): Promise<string | null> {
  if (!WEB_ORIGIN) return null;
  const res = await WebBrowser.openAuthSessionAsync(`${WEB_ORIGIN}/captcha`, 'athleit://captcha');
  if (res.type !== 'success') return null;
  const m = /[?&#]token=([^&#]+)/.exec(res.url);
  return m ? decodeURIComponent(m[1] ?? '') : null;
}

export const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'legal_guardian', label: 'Legal guardian' },
] as const;
