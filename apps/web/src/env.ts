import { parseEnv, supabasePublicEnvSchema } from '@athleit/core';

// NEXT_PUBLIC_* must be referenced literally so Next can inline them into the browser bundle.
export const env = parseEnv(
  supabasePublicEnvSchema,
  {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  { url: 'NEXT_PUBLIC_SUPABASE_URL', anonKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
  'Copy apps/web/.env.example to apps/web/.env.local and fill it in (README: "Environment variables").',
);
