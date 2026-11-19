import { createContext, use, useEffect, type ReactNode } from 'react';

export const ScreenFooterContext = createContext<((n: ReactNode) => void) | null>(null);

/**
 * Pins its children above the tab bar for as long as it is mounted (the Pay bar on mobile). It renders nothing in
 * place: the screen frame draws it outside the scroll area so it stays put while the list scrolls.
 */
export function ScreenFooter({ children }: { children: ReactNode }) {
  const set = use(ScreenFooterContext);
  useEffect(() => {
    set?.(children);
  }, [set, children]);
  useEffect(() => () => set?.(null), [set]);
  return null;
}
