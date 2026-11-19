import { createContext, use, useEffect } from 'react';

export interface ScreenTitle {
  title: string;
  subtitle?: string;
}
export const ScreenTitleContext = createContext<((t: ScreenTitle | null) => void) | null>(null);

/** Puts a title and subtitle in the header, on the same row as the back button. Cleared when the screen goes. */
export function useScreenTitle(title: string, subtitle?: string) {
  const set = use(ScreenTitleContext);
  useEffect(() => {
    set?.({ title, ...(subtitle ? { subtitle } : {}) });
    return () => set?.(null);
  }, [set, title, subtitle]);
}
