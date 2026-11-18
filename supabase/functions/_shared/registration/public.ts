// get-public-registration core. Visible to anyone with the link: explicit public-safe fields only (the database function
// decides), coarse spots label, no registrants. Anonymous responses are cacheable; anything personalized is not.
import type { Result } from './submit.ts';

export interface PublicStore {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  /** get_public_registration, called AS the caller (anon or the user's JWT). */
  event(slug: string, authHeader: string | null): Promise<Record<string, any> | null>;
  coverUrl(path: string, expiresIn: number): Promise<string | null>;
}

export async function getPublicRegistration(
  d: { store: PublicStore; cacheSeconds?: number },
  req: { ip: string; slug: unknown; authHeader: string | null },
): Promise<Result & { headers: Record<string, string> }> {
  const none = { 'cache-control': 'no-store' };
  if (typeof req.slug !== 'string' || !/^[a-zA-Z0-9-]{3,80}$/.test(req.slug))
    return { status: 404, body: { error: 'not_found' }, headers: none };
  // Slugs are public by design but must not be enumerable: every miss looks the same, and lookups are rate limited.
  if (!(await d.store.rateLimit(`reg-public:ip:${req.ip}`, 60, 60)))
    return { status: 429, body: { error: 'rate_limited' }, headers: none };
  const ev = await d.store.event(req.slug.toLowerCase(), req.authHeader);
  if (!ev) return { status: 404, body: { error: 'not_found' }, headers: none };
  const out: Record<string, any> = { ...ev };
  if (typeof ev.cover_image_path === 'string')
    out.cover_url = await d.store.coverUrl(ev.cover_image_path, 3600);
  delete out.cover_image_path;
  const seconds = d.cacheSeconds ?? 60;
  const headers: Record<string, string> = req.authHeader
    ? { 'cache-control': 'private, no-store' }
    : {
        'cache-control': `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=120`,
      };
  if (ev.noindex) headers['x-robots-tag'] = 'noindex, nofollow';
  return { status: 200, body: out, headers };
}
