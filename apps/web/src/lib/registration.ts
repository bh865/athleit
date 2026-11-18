'use client';

import type { EdgeConfig } from '@athleit/db/registration';

import { env } from '@/env';
import { getClient } from '@/lib/supabase/browser';

export const edgeConfig: EdgeConfig = { url: env.url, anonKey: env.anonKey };

/** The signed-in user's access token, or null for a visitor. */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await getClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'legal_guardian', label: 'Legal guardian' },
] as const;
