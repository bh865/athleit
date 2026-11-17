import { z } from 'zod';

/** Public Supabase settings shared by both apps (each app maps its own env var names onto this). */
export const supabasePublicEnvSchema = z.object({
  url: z.url({ error: 'must be a URL, e.g. http://127.0.0.1:54321' }),
  anonKey: z.string().min(1, { error: 'is required' }),
});
export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;

/**
 * Validate environment values at startup and fail loudly with an actionable message.
 * `names` maps each schema key to the env var the user actually has to set.
 */
export function parseEnv<S extends z.ZodObject>(
  schema: S,
  values: Record<string, unknown>,
  names: Record<keyof z.infer<S> & string, string>,
  hint = 'Copy .env.example to .env.local and fill it in (see README, "Environment variables").',
): z.infer<S> {
  const result = schema.safeParse(values);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? '');
    const name = (names as Record<string, string>)[key] ?? key;
    return `  - ${name}: ${issue.message}`;
  });
  throw new Error(`Invalid environment variables:\n${lines.join('\n')}\n${hint}`);
}
