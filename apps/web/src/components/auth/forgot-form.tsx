'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { requestPasswordReset, type AuthFormState } from '@/app/(auth)/actions';
import { Button, TextField } from '@/components/ui';

import { ResendButton } from './auth-parts';
import formStyles from './auth-form.module.css';
import styles from './auth-page.module.css';

const initial: AuthFormState = {};

/** Asks for the email and always answers the same way, so it never reveals whether an account exists. */
export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.fieldErrors)
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.done) {
    const email = state.values?.email ?? '';
    return (
      <div className={styles.stack}>
        <p>
          If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
        </p>
        <a className={styles.link} href="mailto:">
          Open mail app
        </a>
        <ResendButton
          onResend={async () => {
            const data = new FormData();
            data.set('email', email);
            const res = await requestPasswordReset({}, data);
            return res.error ? { error: res.error } : {};
          }}
        />
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form ref={ref} action={action} className={formStyles.form} noValidate>
      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      {state.error && (
        <p role="alert" className={formStyles.error}>
          {state.error}
        </p>
      )}
      <Button type="submit" fullWidth size="lg" loading={pending}>
        Send reset link
      </Button>
      <p className={formStyles.switch}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}
