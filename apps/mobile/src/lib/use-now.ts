import { useEffect, useState } from 'react';

/** A clock that ticks without refetching, so relative labels ("in 38 min", "Live now") stay right. */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
