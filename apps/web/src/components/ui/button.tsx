import type { ButtonVariant } from '@athleit/ui-core';
import Link from 'next/link';
import type { ComponentProps, ComponentPropsWithoutRef } from 'react';

import styles from './button.module.css';
import { Glass, type GlassProps } from './glass';
import { Icon } from './icon';
import type { IconName } from '@athleit/ui-core';

export type { ButtonVariant };

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  /** Shows a busy state and blocks clicks (e.g. while a form is pending). */
  loading?: boolean;
}

/** Primary (lime pill, charcoal text in both modes) is for the one main action on a screen. */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'lg' ? styles.lg : '',
    fullWidth ? styles.full : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  icon: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  large?: boolean;
}

/** Round glass icon button (44 to 48). */
export function IconButton({
  icon,
  label,
  large,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <Glass
      {...(rest as Omit<GlassProps, 'ref'>)}
      as="button"
      level="bar"
      type={type}
      aria-label={label}
      className={[styles.iconButton, large ? styles.iconLg : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name={icon} />
    </Glass>
  );
}

export interface ButtonLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
}

/** A link that looks like a Button (use for navigation actions such as "New message"). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      {...rest}
      className={[styles.button, styles[variant], size === 'lg' ? styles.lg : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}
