import { ForgotForm } from '@/components/auth/forgot-form';
import styles from '@/components/auth/auth-page.module.css';
import { Heading } from '@/components/ui';

export default function ForgotPasswordPage() {
  return (
    <>
      <Heading as="h2" className={styles.heading}>
        Reset your password
      </Heading>
      <p className={styles.sub}>Enter your email and we’ll send you a link.</p>
      <ForgotForm />
    </>
  );
}
