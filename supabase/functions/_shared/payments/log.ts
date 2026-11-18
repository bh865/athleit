// Structured logging that cannot leak secrets or personal data: keys that look sensitive are redacted,
// long strings are cut, and request/webhook bodies are never logged (only ids, types and outcomes).
const SENSITIVE =
  /secret|token|key|authorization|password|email|name|phone|address|payload|body|client_secret|card|signature/i;
const MAX = 200;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX ? `${value.slice(0, MAX)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 3) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return '[unserializable]';
}

export type Logger = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields?: Record<string, unknown>,
) => void;

export function makeLogger(
  fn: string,
  sink: (line: string) => void = (l) => console.log(l),
): Logger {
  return (level, event, fields = {}) =>
    sink(
      JSON.stringify({
        level,
        fn,
        event,
        at: new Date().toISOString(),
        ...(redact(fields) as object),
      }),
    );
}
