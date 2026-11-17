import styles from './logo.module.css';

export interface LogoProps {
  /** mark: the ring-and-stem glyph; lockup: glyph + "athleit" wordmark; app-icon: lime tile. */
  variant?: 'mark' | 'lockup' | 'app-icon';
  /** Glyph size in the `--space` scale (px token). */
  size?: 'sm' | 'md' | 'lg';
}

/** Mark per the Logo file: charcoal on light, lime on dark (the `bubbleOwn` colour). */
function Glyph({ className }: { className?: string }) {
  return (
    <svg viewBox="12 24.5 67 67" role="img" aria-label="Athleit" className={className}>
      <circle cx="42" cy="58" r="20" fill="none" stroke="currentColor" strokeWidth="14" />
      <rect x="62" y="31" width="14" height="54" rx="7" fill="currentColor" />
    </svg>
  );
}

export function Logo({ variant = 'lockup', size = 'md' }: LogoProps) {
  if (variant === 'app-icon')
    return (
      <span className={`${styles.tile} ${styles[size]}`}>
        <Glyph className={styles.tileGlyph} />
      </span>
    );
  if (variant === 'mark') return <Glyph className={`${styles.glyph} ${styles[size]}`} />;
  return (
    <span className={`${styles.lockup} ${styles[size]}`}>
      <Glyph className={styles.glyph} />
      <span className={styles.word} aria-hidden>
        athleit
      </span>
    </span>
  );
}
