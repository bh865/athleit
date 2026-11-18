'use client';

import { useEffect, useRef } from 'react';

import { Text } from '@/components/ui';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

// The PUBLIC site key only. The secret lives in Edge Function secrets. Test key: 1x00000000000000000000AA.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Cloudflare Turnstile widget. Without a site key it shows a notice, and the form stays unsubmittable (fails closed). */
export function Captcha({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!SITE_KEY || !host.current) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !host.current || !window.turnstile) return;
      if (widget.current) window.turnstile.remove(widget.current);
      widget.current = window.turnstile.render(host.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };
    onToken(null);
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!s) {
        s = document.createElement('script');
        s.src = SCRIPT;
        s.async = true;
        s.dataset.turnstile = '1';
        document.head.appendChild(s);
      }
      s.addEventListener('load', mount);
    }
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  if (!SITE_KEY)
    return (
      <Text muted role="status">
        Verification is not set up yet, so registration is unavailable.
      </Text>
    );
  return <div ref={host} aria-label="Human check" />;
}
