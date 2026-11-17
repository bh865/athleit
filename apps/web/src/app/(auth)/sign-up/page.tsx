import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { AuthForm } from '@/components/auth/auth-form';
import { safeNext } from '@/lib/safe-next';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <>
      <Heading as="h2" className={styles.heading}>
        Create your account
      </Heading>
      <AuthForm mode="sign-up" next={target === '/' ? undefined : target} />
    </>
  );
}
