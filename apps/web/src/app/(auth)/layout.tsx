import { APP_NAME } from '@athleit/core';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui';

import styles from './auth-layout.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.brand}>{APP_NAME}</h1>
        <Card>{children}</Card>
      </div>
    </main>
  );
}
