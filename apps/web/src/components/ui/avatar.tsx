'use client';

import { avatarSlot, initialsOf, type AvatarSize } from '@athleit/ui-core';
import { useState } from 'react';

import styles from './avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** Photo URL; falls back to initials on the rotating palette (also if the image fails to load). */
  src?: string | null;
}

export function Avatar({ name, size = 'md', src }: AvatarProps) {
  const slot = avatarSlot(name);
  // Remember which URL failed so a new URL (a replaced photo) gets a fresh try.
  const [failed, setFailed] = useState<string | null>(null);
  return src && failed !== src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote signed URL, size fixed by CSS
    <img
      src={src}
      alt=""
      className={`${styles.avatar} ${styles[size]}`}
      onError={() => setFailed(src)}
    />
  ) : (
    <span aria-hidden className={`${styles.avatar} ${styles[size]} ${styles[`slot${slot}`]}`}>
      {initialsOf(name)}
    </span>
  );
}
