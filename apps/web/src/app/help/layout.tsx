import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { Chrome } from '@/components/help/chrome';
import styles from '@/components/help/help.module.css';
import { SearchBox } from '@/components/help/search-box';
import { Logo } from '@/components/ui';
import { searchDocs } from '@/lib/help/content';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: { default: 'Help', template: '%s · Athleit Help' },
  description: 'Answers about teams, schedules, payments and your account.',
};

export default async function HelpLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  return (
    <div className={styles.shell}>
      <a href="#help-main" className={styles.skip}>
        Skip to content
      </a>
      <Suspense>
        <Chrome>
          <header className={styles.header}>
            <Link href="/help" aria-label="Athleit Help home">
              <Logo variant="lockup" size="sm" />
            </Link>
            <SearchBox docs={searchDocs()} signedIn={signedIn} />
            <nav aria-label="Help" className={styles.headerLinks}>
              <Link className={styles.link} href="/help/contact">
                Contact support
              </Link>
              {signedIn ? (
                <Link className={styles.link} href="/">
                  Back to Athleit
                </Link>
              ) : (
                <Link className={styles.link} href="/sign-in?next=/help">
                  Sign in
                </Link>
              )}
            </nav>
          </header>
        </Chrome>
      </Suspense>
      <main id="help-main" className={styles.main}>
        {children}
      </main>
      <Suspense>
        <Chrome>
          <footer className={styles.footer}>
            <Link className={styles.link} href="/help/whats-new">
              What’s new
            </Link>
          </footer>
        </Chrome>
      </Suspense>
    </div>
  );
}
