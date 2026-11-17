import type { OAuthProvider, SignInInput, SignUpInput } from '@athleit/core';
import type { Session } from '@athleit/db';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { revokeThisDevice } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export interface AuthResult {
  error?: string;
  /** Set when sign-up succeeded but email confirmation is required before a session exists. */
  message?: string;
}

interface AuthContextValue {
  session: Session | null;
  /** True until the stored session has been read. */
  initializing: boolean;
  signIn: (input: SignInInput) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signInWithProvider: (provider: OAuthProvider) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION first, so it covers the stored-session read too.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setInitializing(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,

      async signIn({ email, password }) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
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
        if (error) return { error: error.message };
        return data.session
          ? {}
          : { message: 'Check your email to confirm your account, then sign in.' };
      },

      // Browser-based OAuth with PKCE. Requires the provider to be enabled with real
      // credentials in supabase/config.toml (see README).
      async signInWithProvider(provider) {
        const redirectTo = Linking.createURL('auth/callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) return { error: error?.message ?? 'Could not start sign-in' };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return {}; // cancelled or dismissed
        const code = Linking.parse(result.url).queryParams?.code;
        if (typeof code !== 'string') return { error: 'Sign-in did not return a code' };
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        return exchange.error ? { error: exchange.error.message } : {};
      },

      async signOut() {
        await revokeThisDevice().catch(() => undefined);
        await supabase.auth.signOut();
      },
    }),
    [session, initializing],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
