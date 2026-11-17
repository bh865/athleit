import { createMobileSupabase } from '@athleit/db/mobile';
import { AppState } from 'react-native';

import { env } from '@/env';
import { supabaseStorage } from '@/lib/secure-storage';

export const supabase = createMobileSupabase(env, supabaseStorage);

// Refresh tokens only while the app is in the foreground (per Supabase's React Native guide).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
