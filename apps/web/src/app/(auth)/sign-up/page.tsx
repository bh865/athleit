import { AuthForm } from '@/components/auth/auth-form';

export default function SignUpPage() {
  return (
    <>
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Create your account</h2>
      <AuthForm mode="sign-up" />
    </>
  );
}
