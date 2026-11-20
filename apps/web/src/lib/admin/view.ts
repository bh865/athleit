import type { AdminBucket, AdminRange } from '@athleit/db/admin';

import type { RangeOption } from '@/components/admin/chart';
import { hrefBuilder } from '@/components/admin/kit';

export type SearchParams = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const RANGE_LABEL: Record<AdminRange, string> = { '24h': '24h', '7d': '7d', '30d': '30d', '90d': '90d', '12m': '12m' };

/** A validated range from the URL (anything unknown falls back), and the bucket that suits it. */
export function parseRange(sp: SearchParams, allowed: readonly AdminRange[], fallback: AdminRange): AdminRange {
  const v = one(sp.range) as AdminRange | undefined;
  return v && allowed.includes(v) ? v : fallback;
}
export const bucketFor = (r: AdminRange): AdminBucket => (r === '24h' ? 'hour' : r === '7d' || r === '30d' ? 'day' : r === '90d' ? 'week' : 'month');

export function rangeOptions(path: string, sp: SearchParams, allowed: readonly AdminRange[], current: AdminRange): RangeOption[] {
  const href = hrefBuilder(path, sp);
  return allowed.map((r) => ({ value: r, label: RANGE_LABEL[r], href: href({ range: r }), active: r === current }));
}

export const shortDate = (iso: string, bucket: AdminBucket = 'day') =>
  new Date(iso).toLocaleDateString('en-US', bucket === 'month' ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Fill a metric series: [{at, n}] -> labels and values. */
export function toSeries(points: { at: string; n?: number | undefined; cents?: number | undefined }[], field: 'n' | 'cents', bucket: AdminBucket) {
  return { labels: points.map((p) => shortDate(p.at, bucket)), data: points.map((p) => p[field] ?? 0) };
}
