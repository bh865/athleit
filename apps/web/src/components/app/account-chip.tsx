'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { signOut } from '@/app/(auth)/actions';
import { Avatar, Button, Icon, Popover, Text, ThemeToggle } from '@/components/ui';

import { useApp } from './app-provider';
import { ADD_LABEL } from './context-switcher';
import styles from './account-chip.module.css';

/**
 * The signed-in user's chip (avatar, name, email) and the account menu it opens. `variant="avatar"`
 * is the narrow-screen top-bar button: just the photo, same menu.
 */
export function AccountChip({ variant = 'chip' }: { variant?: 'chip' | 'avatar' }) {
  const { displayName, email, avatarUrl, addActions } = useApp();
  const pathname = usePathname();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const name = displayName ?? email ?? 'Account';
  const onAccount = pathname === '/account' || pathname.startsWith('/account/');
  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={variant === 'avatar' ? styles.avatarButton : styles.chip}
        data-active={onAccount ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        data-testid={variant === 'avatar' ? 'account-chip-avatar' : 'account-chip'}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={name} src={avatarUrl} size={variant === 'avatar' ? 'sm' : 'md'} />
        {variant === 'chip' ? (
          <span className={styles.text}>
            <span className={styles.name}>{displayName ?? email}</span>
            {displayName && email ? <span className={styles.email}>{email}</span> : null}
          </span>
        ) : null}
        {variant === 'chip' ? <Icon name="caret-up-down" size="sm" /> : null}
      </button>
      <Popover
        open={open}
        onClose={close}
        anchor={ref}
        label="Account menu"
        align={variant === 'avatar' ? 'end' : 'start'}
      >
        <div className={styles.menu}>
          <div className={styles.menuHead}>
            <Avatar name={name} src={avatarUrl} size="md" />
            <span className={styles.text}>
              <span className={styles.name}>{displayName ?? email}</span>
              {displayName && email ? <span className={styles.email}>{email}</span> : null}
            </span>
          </div>
          <Link href="/account" className={styles.item} onClick={close}>
            <Icon name="user" size="sm" /> Account
          </Link>
          <Link href="/account#notifications" className={styles.item} onClick={close}>
            <Icon name="bell" size="sm" /> Notification settings
          </Link>
          <div className={styles.group}>
            <Text variant="caption" muted as="p">
              THEME
            </Text>
            <ThemeToggle />
          </div>
          {addActions.length ? (
            <div className={styles.group}>
              {addActions.map((a) => (
                <Link key={a} href={ADD_LABEL[a].href} className={styles.item} onClick={close}>
                  <Icon name="plus" size="sm" /> {ADD_LABEL[a].label}
                </Link>
              ))}
            </div>
          ) : null}
          <form action={signOut}>
            <Button type="submit" variant="ghost" fullWidth>
              <Icon name="sign-out" size="sm" /> Sign out
            </Button>
          </form>
        </div>
      </Popover>
    </>
  );
}
