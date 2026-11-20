'use client';

import { getPhotoUrl } from '@athleit/db/api';
import { useEffect, useRef, useState } from 'react';

import { Avatar, type AvatarProps } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

const cache = new Map<string, { url: string; expires: number }>();
const cached = (path: string | null | undefined) => {
  const hit = path ? cache.get(path) : undefined;
  return hit && hit.expires > Date.now() ? hit.url : null;
};

/**
 * Initials until the row scrolls into view, then the signed photo URL (fetched once per path and kept
 * for 50 minutes; the URLs last an hour). Falls back to initials if there is no photo or it fails.
 */
export function PlayerAvatar({
  name,
  photoPath,
  size,
}: {
  name: string;
  photoPath?: string | null | undefined;
  size?: AvatarProps['size'];
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(() => cached(photoPath));

  useEffect(() => {
    if (!photoPath || visible) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [photoPath, visible]);

  useEffect(() => {
    if (!photoPath || !visible || url) return;
    let live = true;
    const hit = cached(photoPath);
    const next = hit
      ? Promise.resolve(hit)
      : getPhotoUrl(getClient(), photoPath).then((res) => {
          if (res.error || !res.data) return null;
          cache.set(photoPath, { url: res.data, expires: Date.now() + 50 * 60_000 });
          return res.data;
        });
    void next.then((u) => live && u && setUrl(u));
    return () => {
      live = false;
    };
  }, [photoPath, visible, url]);

  return (
    <span ref={box} style={{ display: 'inline-flex' }}>
      <Avatar name={name} src={url} {...(size ? { size } : {})} />
    </span>
  );
}
