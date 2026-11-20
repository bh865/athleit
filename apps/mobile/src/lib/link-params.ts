/** Query and fragment parameters of a link (Supabase puts errors in the fragment). */
export function readLinkParams(url: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!url) return out;
  const rest = url.split('?').slice(1).join('?');
  const parts = [rest.split('#')[0] ?? '', url.split('#')[1] ?? ''];
  for (const part of parts) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [k, ...v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.join('=').replace(/\+/g, ' '));
    }
  }
  return out;
}
