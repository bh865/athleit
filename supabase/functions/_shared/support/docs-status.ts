// HMAC check for report-docs-status. Pure and injectable so it is unit tested; fails closed on a missing secret.
const MAX_SKEW_MS = 10 * 60_000;

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyDocsSignature(a: {
  secret: string | undefined;
  body: string;
  timestamp: string | null;
  signature: string | null;
  now: number;
  equal: (x: string, y: string) => boolean;
}): Promise<boolean> {
  if (!a.secret || !a.timestamp || !a.signature || !/^\d{9,12}$/.test(a.timestamp)) return false;
  if (Math.abs(a.now - Number(a.timestamp) * 1000) > MAX_SKEW_MS) return false;
  return a.equal(a.signature, await hmacHex(a.secret, `${a.timestamp}.${a.body}`));
}
