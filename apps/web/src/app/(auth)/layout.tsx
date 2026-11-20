import type { ReactNode } from 'react';

import { Logo } from '@/components/ui';
import { legalUrls } from '@/lib/auth-config';

import styles from './auth-layout.module.css';

/**
 * Desktop: a quiet brand pane beside the form. Narrower than 1024px the brand pane collapses to the
 * logo above a centred card (the 834 tablet board), and below 600px the card goes edge to edge.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <aside className={styles.brandPane}>
        <h1 className={styles.brand}>
          <Logo variant="lockup" size="lg" />
        </h1>
        <p className={styles.tagline}>Your team, your family, one place.</p>
        <ul className={styles.points}>
          <li>Your child’s information is never shared with other families</li>
          <li>Approved by your coach</li>
        </ul>
        {legalUrls.terms || legalUrls.privacy ? (
          <p className={styles.legal}>
            {legalUrls.terms ? <a href={legalUrls.terms}>Terms</a> : null}
            {legalUrls.terms && legalUrls.privacy ? ' · ' : null}
            {legalUrls.privacy ? <a href={legalUrls.privacy}>Privacy</a> : null}
          </p>
        ) : null}
      </aside>
      <section className={styles.formPane}>
        <p className={styles.compactBrand}>
          <Logo variant="lockup" size="lg" />
        </p>
        <div className={styles.card}>{children}</div>
      </section>
    </main>
  );
}
