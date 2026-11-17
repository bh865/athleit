import Link from 'next/link';

import { safeNext } from '@/lib/safe-next';

import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { AuthForm } from '@/components/auth/auth-form';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <>
      <Heading as="h2" className={styles.heading}>
        Sign in
      </Heading>
      {error && (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      )}
      <AuthForm mode="sign-in" next={safeNext(next) === '/' ? undefined : safeNext(next)} />
      {process.env.NODE_ENV !== 'production' && (
        <p className={styles.devLink}>
          <Link href="/dev/design">Design gallery</Link>
        </p>
      )}
    </>
  );
}
