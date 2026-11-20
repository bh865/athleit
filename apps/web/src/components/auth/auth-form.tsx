'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { signIn, signInWithProvider, signUp, type AuthFormState } from '@/app/(auth)/actions';
import { Button, Icon, TextField } from '@/components/ui';
import { authProviders } from '@/lib/auth-config';

import { ConsentLine, PasswordField } from './auth-parts';
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
  const formRef = useRef<HTMLFormElement>(null);
  const messages = Object.values(state.fieldErrors ?? {}).filter(Boolean) as string[];
  const hasSocial = authProviders.google || authProviders.apple;

  // After a failed submit, move focus to the first invalid field (or the error summary).
  useEffect(() => {
    if (!state.fieldErrors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <div className={styles.wrap}>
      {hasSocial ? (
        <>
          <div className={styles.providers}>
            {authProviders.google ? (
              <form action={signInWithProvider.bind(null, 'google', next)}>
                <Button type="submit" variant="secondary" fullWidth>
                  <Icon name="google-logo" /> Continue with Google
                </Button>
              </form>
            ) : null}
            {authProviders.apple ? (
              <form action={signInWithProvider.bind(null, 'apple', next)}>
                <Button type="submit" variant="secondary" fullWidth>
                  <Icon name="apple-logo" weight="fill" /> Continue with Apple
                </Button>
              </form>
            ) : null}
          </div>
          <div className={styles.divider} role="separator">
            <span>or</span>
          </div>
        </>
      ) : null}

      <form ref={formRef} action={action} className={styles.form} noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        {messages.length > 0 ? (
          <div role="alert" className={styles.error}>
            <strong>Check these and try again:</strong>
            <ul className={styles.summary}>
              {messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
          autoComplete={isSignUp ? 'email' : 'username'}
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <PasswordField isNew={isSignUp} error={state.fieldErrors?.password} />
        {!isSignUp && (
          <p className={styles.forgot}>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
        )}
        <p className={styles.forgot}>
          <Link href="/help/a/join-a-team-with-a-code-or-link">Need help signing in?</Link>
        </p>
        {isSignUp && <ConsentLine />}
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
        <Button type="submit" fullWidth size="lg" loading={pending}>
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
      </form>

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
