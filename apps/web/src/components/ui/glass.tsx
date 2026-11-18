import type { ComponentProps, ElementType } from 'react';

import styles from './glass.module.css';

export type GlassLevel = 'bar' | 'sheet' | 'modal';

export interface GlassProps extends ComponentProps<'div'> {
  /** Element to render (nav, aside, header, button…). Defaults to div. */
  as?: ElementType;
  /** Only when rendered as a button. */
  type?: 'button' | 'submit' | 'reset';
  /** bar: nav and headers. sheet: drawers, popovers, toasts. modal: dialogs. Never for content cards. */
  level?: GlassLevel;
  /**
   * Opaque surface instead of blur, for menus and popovers that sit over text or inside another glass
   * layer (a backdrop-filter nested in a backdrop-filter blurs nothing, so text would show through).
   */
  solid?: boolean;
}

/**
 * The ONLY place backdrop-filter is used (enforced by lint). Reduced transparency swaps the
 * tint for a solid surface and drops blur and shadow, purely through the generated variables.
 */
export function Glass({ level = 'bar', as: Tag = 'div', solid, className, ...rest }: GlassProps) {
  return (
    <Tag
      {...rest}
      data-glass={level}
      className={[styles.glass, styles[level], solid ? styles.solid : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}
