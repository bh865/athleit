import { redirect } from 'next/navigation';

import { signOut } from '@/app/(auth)/actions';
import { Button, Card, ThemeToggle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

import styles from './home.module.css';

/** Protected Home screen. proxy.ts already redirects guests; this re-checks on the server. */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // RLS guarantees this returns only the signed-in user's own row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const name = profile?.display_name ?? user.email ?? 'there';

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.header}>
          <ThemeToggle />
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </header>
        <Card>
          <p className={styles.eyebrow}>Welcome back</p>
          <h1 className={styles.name} data-testid="display-name">
            {name}
          </h1>
          <p className={`${styles.id} mono`}>{user.id}</p>
        </Card>
      </div>
    </main>
  );
}
