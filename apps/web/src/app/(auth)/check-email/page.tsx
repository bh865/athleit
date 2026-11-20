import { redirect } from 'next/navigation';

import { CheckEmail } from '@/components/auth/check-email';
import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { safeNext } from '@/lib/safe-next';

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const { email, next } = await searchParams;
  if (!email) redirect('/sign-up');
  return (
    <>
      <Heading as="h2" className={styles.heading}>
        Check your email
      </Heading>
      <CheckEmail email={email} next={safeNext(next)} />
    </>
  );
}
