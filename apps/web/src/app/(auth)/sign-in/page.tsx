import Link from 'next/link';

import { safeNext } from '@/lib/safe-next';

import { AuthForm } from '@/components/auth/auth-form';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <>
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Sign in</h2>
      {error && (
        <p
          role="alert"
          style={{ marginBottom: 'var(--space-4)', color: 'var(--color-danger-text)' }}
        >
          {error}
        </p>
      )}
      <AuthForm mode="sign-in" next={safeNext(next) === '/' ? undefined : safeNext(next)} />
      {process.env.NODE_ENV !== 'production' && (
        <p
          style={{
            marginTop: 'var(--space-4)',
            textAlign: 'center',
            fontSize: 'var(--text-sm-size)',
          }}
        >
          <Link href="/smoke">Design smoke test</Link>
        </p>
      )}
    </>
  );
}
