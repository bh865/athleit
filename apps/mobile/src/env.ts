import { parseEnv, supabasePublicEnvSchema } from '@athleit/core';

// EXPO_PUBLIC_* must be referenced literally so Expo can inline them into the bundle.
// Imported by the root layout, so a bad .env fails at app start with a clear message.
export const env = parseEnv(
  supabasePublicEnvSchema,
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  { url: 'EXPO_PUBLIC_SUPABASE_URL', anonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY' },
  'Copy apps/mobile/.env.example to apps/mobile/.env.local, fill it in and restart Expo (README: "Environment variables").',
);
