import type { z } from 'zod';

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

/** First error message per field, for rendering under inputs. */
export function fieldErrors<T extends string>(error: z.ZodError): FieldErrors<T> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out as FieldErrors<T>;
}
