import type { ReactNode } from 'react';
import Link from 'next/link';

import { Icon } from './icon';
import styles from './list-row.module.css';

export interface ListRowProps {
  /** Left slot: a 44px Avatar or icon circle. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right slot: amount, badge, buttons. */
  trailing?: ReactNode;
  /** Makes the whole row a link and shows a caret. */
  href?: string;
  className?: string;
  'data-testid'?: string;
}

/** 64px row with a 1px separator, 44px leading slot and a caret when navigable. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  href,
  className,
  ...rest
}: ListRowProps) {
  const body = (
    <>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      {href ? <Icon name="caret-right" size="sm" /> : null}
    </>
  );
  const cls = [styles.row, href ? styles.link : '', className ?? ''].filter(Boolean).join(' ');
  return href ? (
    <Link href={href} className={cls} {...rest}>
      {body}
    </Link>
  ) : (
    <div className={cls} {...rest}>
      {body}
    </div>
  );
}

/** Wrapper for a column of rows: surface card with the rows separated by 1px lines. */
export function ListGroup({ children, ...rest }: { children: ReactNode; 'data-testid'?: string }) {
  return (
    <ul className={styles.group} {...rest}>
      {children}
    </ul>
  );
}

export function IconCircle({ children }: { children: ReactNode }) {
  return <span className={styles.iconCircle}>{children}</span>;
}
