import type { ComponentProps } from 'react';

import styles from './glass-bar.module.css';

export type GlassLevel = 'bar' | 'sheet' | 'modal';

export interface GlassBarProps extends ComponentProps<'div'> {
  /** Material strength: bar (lightest) < sheet < modal (most opaque). */
  level?: GlassLevel;
}

/**
 * Frosted-glass surface using backdrop-filter. When the OS asks for reduced
 * transparency (or the app override is on), the tokens swap in a solid surface
 * and drop the blur; nothing here needs to change.
 */
export function GlassBar({ level = 'bar', className, ...rest }: GlassBarProps) {
  return (
    <div
      {...rest}
      data-glass={level}
      className={[styles.glass, styles[level], className ?? ''].filter(Boolean).join(' ')}
    />
  );
}
