import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from './icon';
import styles from './page-header.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-hand slot: the page's primary action (lime pill) and secondary buttons. */
  actions?: ReactNode;
  /** Quiet "back" link above the title. */
  back?: { href: string; label: string };
  titleTestId?: string;
}

/**
 * The one page heading for every signed-in page: title (h1), muted subtitle, actions at the right,
 * always at the top of the page and never inside a card.
 */
export function PageHeader({ title, subtitle, actions, back, titleTestId }: PageHeaderProps) {
  return (
    <header className={styles.header} data-testid="page-header">
      {back ? (
        <Link href={back.href} className={styles.back}>
          <Icon name="caret-left" size="sm" /> {back.label}
        </Link>
      ) : null}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 className={styles.title} data-testid={titleTestId}>
            {title}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </header>
  );
}
