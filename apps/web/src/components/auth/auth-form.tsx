'use client';

import { AppleLogo, GoogleLogo } from '@phosphor-icons/react';
import Link from 'next/link';
import { useActionState } from 'react';

import { signIn, signInWithProvider, signUp, type AuthFormState } from '@/app/(auth)/actions';
import { Button, TextField } from '@/components/ui';

import styles from './auth-form.module.css';

const initial: AuthFormState = {};

export function AuthForm({
  mode,
  next,
}: {
  mode: 'sign-in' | 'sign-up';
  next?: string | undefined;
}) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
  const isSignUp = mode === 'sign-up';
  const [state, action, pending] = useActionState(isSignUp ? signUp : signIn, initial);

  return (
    <div className={styles.wrap}>
      <form action={action} className={styles.form} noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        {isSignUp && (
          <TextField
            name="displayName"
            label="Your name"
            autoComplete="name"
            defaultValue={state.values?.displayName}
            error={state.fieldErrors?.displayName}
          />
        )}
        <TextField
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <TextField
          name="password"
          type="password"
          label="Password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          hint={isSignUp ? 'At least 8 characters' : undefined}
          error={state.fieldErrors?.password}
        />
        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className={styles.message}>
            {state.message}
          </p>
        )}
        <Button type="submit" fullWidth loading={pending}>
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <div className={styles.divider} role="separator">
        <span>or</span>
      </div>

      {/* Google/Apple need real credentials in supabase/config.toml (see README). */}
      <div className={styles.providers}>
        <form action={signInWithProvider.bind(null, 'google')}>
          <Button type="submit" variant="secondary" fullWidth>
            <GoogleLogo size={20} weight="bold" aria-hidden /> Continue with Google
          </Button>
        </form>
        <form action={signInWithProvider.bind(null, 'apple')}>
          <Button type="submit" variant="secondary" fullWidth>
            <AppleLogo size={20} weight="fill" aria-hidden /> Continue with Apple
          </Button>
        </form>
      </div>

      <p className={styles.switch}>
        {isSignUp ? (
          <>
            Already have an account? <Link href={`/sign-in${suffix}`}>Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href={`/sign-up${suffix}`}>Create an account</Link>
          </>
        )}
      </p>
    </div>
  );
}
