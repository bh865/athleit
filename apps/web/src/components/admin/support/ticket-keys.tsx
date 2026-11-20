'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** J and K move through the ticket links, Enter opens the focused one. Ignored while typing in a field. */
export function TicketKeys() {
  const router = useRouter();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-ticket]')];
      if (!links.length) return;
      const i = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === 'j') links[Math.min(i + 1, links.length - 1)]?.focus();
      else if (e.key === 'k') links[Math.max(i - 1, 0)]?.focus();
      else if (e.key === 'Enter' && i >= 0) router.push(links[i]!.getAttribute('href')!);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [router]);
  return null;
}
