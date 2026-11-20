import {
  authCopy,
  classifyAuthError,
  friendlyAuthError,
  type OAuthProvider,
  type SignInInput,
  type SignUpInput,
} from '@athleit/core';
import type { Session } from '@athleit/db';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LAST_EMAIL_KEY } from '@/lib/auth-config';
import { kv } from '@/lib/kv';
import { revokeThisDevice } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export interface AuthResult {
  /** Already a sentence for the screen (never backend text). */
  error?: string;
  message?: string;
  /** Sign-up worked but a confirmation email must be opened before a session exists. */
  needsConfirmation?: boolean;
  /** The person closed the social sign-in window. */
  cancelled?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  /** True until the stored session has been read. */
  initializing: boolean;
  /** The last email used to sign in, to prefill the form. */
  lastEmail: string | null;
  /** True when the session ended without the person choosing to sign out. */
  sessionEnded: boolean;
  signIn: (input: SignInInput) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signInWithProvider: (provider: OAuthProvider) => Promise<AuthResult>;
  /** Sends (or re-sends) the confirmation email for the sign-up in progress. */
  resendConfirmation: (email: string) => Promise<AuthResult>;
  /**
   * After the confirmation link was opened somewhere else (the browser), signs in with the
   * credentials held in memory for this sign-up. Returns true once there is a session.
   */
  continueAfterConfirmation: () => Promise<boolean>;
  /** Forgets the sign-up credentials held for the check-email screen. */
  clearPendingSignUp: () => void;
  /** Succeeds from the caller's view unless offline or rate limited, so it never reveals accounts. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /** Exchanges the code from a reset or confirmation link for a session. */
  exchangeCode: (code: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const fail = (error: unknown): AuthResult => ({
  error: friendlyAuthError(error as never),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [lastEmail, setLastEmail] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const hadSession = useRef(false);
  const choseSignOut = useRef(false);
  // Held in memory only, for the lifetime of the check-email screen. Never persisted.
  const pendingSignUp = useRef<{ email: string; password: string } | null>(null);

  useEffect(() => {
    kv.get(LAST_EMAIL_KEY).then(setLastEmail);
  }, []);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION first, so it covers the stored-session read too.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (next) {
        hadSession.current = true;
        choseSignOut.current = false;
        setSessionEnded(false);
      } else if (event === 'SIGNED_OUT' && hadSession.current && !choseSignOut.current) {
        setSessionEnded(true);
      }
      setSession(next);
      setInitializing(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      lastEmail,
      sessionEnded,

      async signIn({ email, password }) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return fail(error);
        setLastEmail(email);
        await kv.set(LAST_EMAIL_KEY, email);
        return {};
      },

      async signUp({ displayName, email, password }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Read by the on_auth_user_created trigger to fill profiles.display_name.
          options: {
            data: { display_name: displayName },
            emailRedirectTo: Linking.createURL('auth/callback'),
          },
        });
        if (error) return fail(error);
        // With confirmations on, an already-registered email comes back as a user with no
        // identities and no error.
        if (data.user && (data.user.identities?.length ?? 1) === 0) {
          return { error: authCopy('email_in_use') };
        }
        if (data.session) return {};
        pendingSignUp.current = { email, password };
        await kv.set(LAST_EMAIL_KEY, email);
        setLastEmail(email);
        return { needsConfirmation: true };
      },

      // Browser-based OAuth with PKCE. Requires the provider to be enabled with real
      // credentials in supabase/config.toml (see README).
      async signInWithProvider(provider) {
        const redirectTo = Linking.createURL('auth/callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) return fail(error ?? { status: 500 });

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') {
          return { cancelled: true, error: authCopy('social_cancelled') };
        }
        const code = Linking.parse(result.url).queryParams?.code;
        if (typeof code !== 'string') return { error: authCopy('server') };
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        return exchange.error ? fail(exchange.error) : {};
      },

      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: Linking.createURL('auth/callback') },
        });
        return error ? fail(error) : {};
      },

      async continueAfterConfirmation() {
        const held = pendingSignUp.current;
        if (!held) return false;
        const { error } = await supabase.auth.signInWithPassword(held);
        if (error) return false; // still unconfirmed (or offline): keep waiting
        pendingSignUp.current = null;
        return true;
      },

      clearPendingSignUp() {
        pendingSignUp.current = null;
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: Linking.createURL('auth/reset'),
        });
        if (!error) return {};
        // Only failures that say nothing about the account are shown; anything else looks like success.
        const kind = classifyAuthError(error);
        return kind === 'offline' || kind === 'too_many_attempts' ? fail(error) : {};
      },

      async exchangeCode(code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return error ? fail(error) : {};
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        return error ? fail(error) : {};
      },

      async signOut() {
        choseSignOut.current = true;
        await revokeThisDevice().catch(() => undefined);
        await supabase.auth.signOut();
      },
    }),
    [session, initializing, lastEmail, sessionEnded],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
