// Help content for the native hub. Articles are web content: they open in the in-app browser on the web article
// (`?embed=1` hides the site chrome), so one source serves web and mobile. The search index is fetched from the web
// (always current) and cached on the device as the offline fallback.
import { kv } from '@/lib/kv';

export const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://athleit.app').replace(
  /\/+$/,
  '',
);
const CACHE_KEY = 'athleit.helpIndex';

export interface HelpDoc {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

export const articleUrl = (slug: string) => `${WEB_ORIGIN}/help/a/${slug}?embed=1`;
export const webContactUrl = (q?: string) =>
  `${WEB_ORIGIN}/help/contact${q ? `?q=${encodeURIComponent(q)}` : ''}`;

/** Fresh from the web when possible; otherwise the last copy saved on this device; otherwise null (offline, never opened). */
export async function loadHelpIndex(): Promise<{ docs: HelpDoc[]; stale: boolean } | null> {
  try {
    const res = await fetch(`${WEB_ORIGIN}/help/index.json`);
    if (res.ok) {
      const docs = (await res.json()) as HelpDoc[];
      void kv.set(CACHE_KEY, JSON.stringify(docs));
      return { docs, stale: false };
    }
  } catch {
    /* fall through to the cache */
  }
  const cached = await kv.get(CACHE_KEY);
  if (!cached) return null;
  try {
    return { docs: JSON.parse(cached) as HelpDoc[], stale: true };
  } catch {
    return null;
  }
}

/** Small, forgiving ranking: every word must appear; title hits count more. */
export function searchDocs(docs: HelpDoc[], q: string): HelpDoc[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return [];
  return docs
    .map((d) => {
      const t = d.title.toLowerCase();
      const s = d.summary.toLowerCase();
      if (!words.every((w) => t.includes(w) || s.includes(w))) return null;
      return { d, score: words.reduce((n, w) => n + (t.includes(w) ? 3 : 1), 0) };
    })
    .filter((x): x is { d: HelpDoc; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.d);
}
