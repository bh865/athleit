'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** The viewer's IANA zone (null during server render, so markup matches on hydration). */
export function useViewerZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}
