'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { updatePassword, type AuthFormState } from '@/app/(auth)/actions';
import { Button } from '@/components/ui';

import { PasswordField } from './auth-parts';
import formStyles from './auth-form.module.css';
import styles from './auth-page.module.css';

const initial: AuthFormState = {};

/** Set a new password for the person the reset link just signed in. */
export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.fieldErrors)
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.done) {
    return (
      <div className={styles.stack} role="status">
        <h3>Password updated</h3>
        <p className={styles.sub}>You’re signed in on this device.</p>
        <Link className={styles.link} href="/">
          Continue
        </Link>
      </div>
    );
  }
  return (
    <form ref={ref} action={action} className={formStyles.form} noValidate>
      <PasswordField label="New password" isNew error={state.fieldErrors?.password} />
      <PasswordField
        name="confirm"
        label="Confirm new password"
        isNew
        error={state.fieldErrors?.confirm}
      />
      {state.error && (
        <p role="alert" className={formStyles.error}>
          {state.error}
        </p>
      )}
      <Button type="submit" fullWidth size="lg" loading={pending}>
        Update password
      </Button>
    </form>
  );
}
