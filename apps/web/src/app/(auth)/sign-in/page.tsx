import { authCopy } from '@athleit/core';
import Link from 'next/link';

import { AuthForm } from '@/components/auth/auth-form';
import { LinkBanner } from '@/components/auth/link-banner';
import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { safeNext } from '@/lib/safe-next';

/** Only sentences this app wrote may appear from `?error=`, never arbitrary text from a link. */
const KNOWN_ERRORS = new Set([
  authCopy('link_expired'),
  authCopy('social_cancelled'),
  authCopy('offline'),
  authCopy('server'),
  authCopy('wrong_credentials'),
  authCopy('too_many_attempts'),
]);

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const target = safeNext(next) === '/' ? undefined : safeNext(next);
  const shown =
    error === 'expired'
      ? authCopy('link_expired')
      : error && KNOWN_ERRORS.has(error)
        ? error
        : null;
  return (
    <>
      <LinkBanner next={target} />
      <Heading as="h2" className={styles.heading}>
        Sign in
      </Heading>
      {shown && (
        <p role="alert" className={styles.alert}>
          {shown}
        </p>
      )}
      <AuthForm mode="sign-in" next={target} />
      {process.env.NODE_ENV !== 'production' && (
        <p className={styles.devLink}>
          <Link href="/dev/design">Design gallery</Link>
        </p>
      )}
    </>
  );
}
