import Link from 'next/link';

import { ResetForm } from '@/components/auth/reset-form';
import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing for the password-reset email: /auth/callback exchanges the one-time code (so the person is
 * signed in) and sends them here. No session means the link was used or has expired.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return (
      <>
        <Heading as="h2" className={styles.heading}>
          This link has expired
        </Heading>
        <div className={styles.stack}>
          <p className={styles.sub}>
            Reset links work once and expire after an hour. Ask for a new one.
          </p>
          <Link className={styles.link} href="/forgot-password">
            Send a new link
          </Link>
          <Link className={styles.link} href="/sign-in">
            Back to sign in
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <Heading as="h2" className={styles.heading}>
        Set a new password
      </Heading>
      <p className={styles.sub}>Choose a password you don’t use anywhere else.</p>
      <ResetForm />
    </>
  );
}
