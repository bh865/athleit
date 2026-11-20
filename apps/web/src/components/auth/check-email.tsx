'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { resendConfirmation } from '@/app/(auth)/actions';
import { getClient } from '@/lib/supabase/browser';

import { ResendButton } from './auth-parts';
import styles from './auth-page.module.css';

/**
 * "Check your email" after sign-up. The confirmation link opens in this browser and signs the person
 * in, so this page watches for a session and carries on by itself.
 */
export function CheckEmail({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let live = true;
    const client = getClient();
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data } = await client.auth.getUser();
      if (live && data.user) setConfirmed(true);
    };
    const t = setInterval(() => void check(), 4000);
    document.addEventListener('visibilitychange', check);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => router.replace(next), 1200);
    return () => clearTimeout(t);
  }, [confirmed, next, router]);

  if (confirmed) {
    return (
      <div className={styles.stack} role="status">
        <p>
          <strong>You’re confirmed</strong>
        </p>
        <p className={styles.sub}>Taking you to the next step.</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <p>
        Check your email to confirm your account. We sent a confirmation link to{' '}
        <strong>{email}</strong>
      </p>
      <p className={styles.sub} role="status">
        Waiting for you to open the link
      </p>
      <a className={styles.link} href="mailto:">
        Open mail app
      </a>
      <ResendButton onResend={() => resendConfirmation(email, next)} />
      <Link
        className={styles.link}
        href={next === '/' ? '/sign-up' : `/sign-up?next=${encodeURIComponent(next)}`}
      >
        Use a different email
      </Link>
      <p className={styles.sub}>Not there? Check spam.</p>
    </div>
  );
}
