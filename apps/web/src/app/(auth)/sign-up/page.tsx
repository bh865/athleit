import { AuthForm } from '@/components/auth/auth-form';
import { LinkBanner } from '@/components/auth/link-banner';
import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';
import { safeNext } from '@/lib/safe-next';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next) === '/' ? undefined : safeNext(next);
  return (
    <>
      <LinkBanner next={target} />
      <Heading as="h2" className={styles.heading}>
        Create your account
      </Heading>
      <AuthForm mode="sign-up" next={target} />
    </>
  );
}
