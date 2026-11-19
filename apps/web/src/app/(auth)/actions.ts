'use server';

import {
  fieldErrors,
  signInSchema,
  signUpSchema,
  type FieldErrors,
  type OAuthProvider,
} from '@athleit/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
  message?: string;
  fieldErrors?: FieldErrors<'displayName' | 'email' | 'password'>;
  /** Echoed back so inputs keep their values after a failed submit (never the password). */
  values?: { displayName?: string; email?: string };
}

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === 'string' ? v : '';
};

async function getOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: text(formData, 'email'), password: text(formData, 'password') };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values: { email: raw.email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message, values: { email: raw.email } };

  redirect(safeNext(text(formData, 'next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    displayName: text(formData, 'displayName'),
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  };
  const values = { displayName: raw.displayName, email: raw.email };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the on_auth_user_created trigger to fill profiles.display_name.
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: error.message, values };

  // Local stack auto-confirms, so there is a session. With email confirmation on
  // (hosted projects), there isn't one yet.
  if (data.session) redirect(safeNext(text(formData, 'next')));
  return { message: 'Check your email to confirm your account, then sign in.', values };
}

export async function signInWithProvider(provider: OAuthProvider) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await getOrigin()}/auth/callback` },
  });
  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? 'Could not start sign-in')}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}

/** Ends every session of this user on every device (including this one). */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/sign-in');
}
