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
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Create your account</h2>
      <AuthForm mode="sign-up" next={target === '/' ? undefined : target} />
    </>
  );
}
