'use server';

import {
  authCopy,
  changePasswordSchema,
  emailSchema,
  fieldErrors,
  friendlyAuthError,
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
  fieldErrors?: FieldErrors<'displayName' | 'email' | 'password' | 'confirm'>;
  /** Echoed back so inputs keep their values after a failed submit (never the password). */
  values?: { displayName?: string; email?: string };
  /** Set by actions that moved on without redirecting (a reset link was sent). */
  done?: boolean;
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

/** Callback URL that returns to `next` (same-site only), so an invite survives sign-up and OAuth. */
async function callbackUrl(next: string) {
  const base = `${await getOrigin()}/auth/callback`;
  return next === '/' ? base : `${base}?next=${encodeURIComponent(next)}`;
}

const withNext = (path: string, next: string, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams(extra);
  if (next !== '/') q.set('next', next);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
};

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: text(formData, 'email'), password: text(formData, 'password') };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values: { email: raw.email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyAuthError(error), values: { email: raw.email } };

  redirect(safeNext(text(formData, 'next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    displayName: text(formData, 'displayName'),
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  };
  const next = safeNext(text(formData, 'next'));
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
      emailRedirectTo: await callbackUrl(next),
    },
  });
  if (error) return { error: friendlyAuthError(error), values };
  // With confirmations on, an already-registered email comes back as a user with no identities.
  if (data.user && (data.user.identities?.length ?? 1) === 0) {
    return { error: authCopy('email_in_use'), values };
  }

  // Local stack auto-confirms, so there is a session. With email confirmation on
  // (hosted projects), there isn't one yet.
  if (data.session) redirect(next);
  redirect(withNext('/check-email', next, { email: parsed.data.email }));
}

/** Social sign-in. `next` rides through the provider and back via /auth/callback. */
export async function signInWithProvider(provider: OAuthProvider, next?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: await callbackUrl(safeNext(next)) },
  });
  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(friendlyAuthError(error ?? { status: 500 }))}`);
  }
  redirect(data.url);
}

/** Sends a reset link. Always the same answer, so it never reveals whether an account exists. */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(text(formData, 'email'));
  const values = { email: text(formData, 'email') };
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message }, values };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent('/auth/reset')}`,
  });
  if (error) {
    const message = friendlyAuthError(error);
    // Only failures that say nothing about the account are shown.
    if (message === authCopy('offline') || message === authCopy('too_many_attempts')) {
      return { error: message, values };
    }
  }
  return { done: true, values: { email: parsed.data } };
}

/** Sets the new password for the person the reset link signed in. */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = changePasswordSchema.safeParse({
    next: text(formData, 'password'),
    confirm: text(formData, 'confirm'),
    hasPassword: false,
  });
  if (!parsed.success) {
    const e = fieldErrors<'next' | 'confirm'>(parsed.error);
    return { fieldErrors: { password: e.next, confirm: e.confirm } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { error: friendlyAuthError(error) };
  return { done: true };
}

/** Re-sends the confirmation email. The 60 second cooldown is enforced on the page; the server has its own. */
export async function resendConfirmation(
  email: string,
  next?: string,
): Promise<{ error?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: authCopy('server') };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(safeNext(next)) },
  });
  return error ? { error: friendlyAuthError(error) } : {};
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
