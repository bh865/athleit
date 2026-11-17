import { avatarSlot, initialsOf, type AvatarSize } from '@athleit/ui-core';

import styles from './avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** Photo URL; falls back to initials on the rotating palette. */
  src?: string | null;
}

export function Avatar({ name, size = 'md', src }: AvatarProps) {
  const slot = avatarSlot(name);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote signed URL, size fixed by CSS
    <img src={src} alt="" className={`${styles.avatar} ${styles[size]}`} />
  ) : (
    <span aria-hidden className={`${styles.avatar} ${styles[size]} ${styles[`slot${slot}`]}`}>
      {initialsOf(name)}
    </span>
  );
}
