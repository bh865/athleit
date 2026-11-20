import { getPhotoUrl } from '@athleit/db/api';
import type { AvatarSize } from '@athleit/ui-core';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const cache = new Map<string, { url: string; expires: number }>();
const cached = (path: string | null | undefined) => {
  const hit = path ? cache.get(path) : undefined;
  return hit && hit.expires > Date.now() ? hit.url : null;
};

/** Initials first, then the signed photo URL (cached 50 minutes per path; initials if it fails). */
export function PlayerAvatar({
  name,
  photoPath,
  size,
}: {
  name: string;
  photoPath?: string | null | undefined;
  size?: AvatarSize;
}) {
  const [url, setUrl] = useState<string | null>(() => cached(photoPath));
  useEffect(() => {
    if (!photoPath || url) return;
    let live = true;
    void getPhotoUrl(supabase, photoPath).then((res) => {
      if (!live || res.error || !res.data) return;
      cache.set(photoPath, { url: res.data, expires: Date.now() + 50 * 60_000 });
      setUrl(res.data);
    });
    return () => {
      live = false;
    };
  }, [photoPath, url]);
  return <Avatar name={name} src={url} {...(size ? { size } : {})} />;
}
