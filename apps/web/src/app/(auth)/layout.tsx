import type { ReactNode } from 'react';

import { Card, Logo } from '@/components/ui';

import styles from './auth-layout.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.brand}>
          <Logo variant="lockup" size="lg" />
        </h1>
        <Card>{children}</Card>
      </div>
    </main>
  );
}
