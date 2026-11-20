import Link from 'next/link';

import styles from './help.module.css';

/** "Need help with this?" Deep-links to one article. Place it in the footer of key screens (Pay, roster invite, registrations, billing, MFA). */
export function HelpLink({
  article,
  children = 'Need help with this?',
}: {
  article: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={`/help/a/${article}`} className={styles.link}>
      {children}
    </Link>
  );
}
