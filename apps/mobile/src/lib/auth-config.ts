import { Platform } from 'react-native';

// EXPO_PUBLIC_* must be referenced literally so Expo can inline them into the bundle.
const on = (v: string | undefined) => v === 'true' || v === '1';

/**
 * Which social buttons this build shows. A provider that is not enabled in the Supabase project
 * (supabase/config.toml ships Google and Apple disabled) must not appear. See the README checklist.
 */
export const authProviders = {
  google: on(process.env.EXPO_PUBLIC_AUTH_GOOGLE),
  apple: on(process.env.EXPO_PUBLIC_AUTH_APPLE),
};

/** Apple first on iPhone, Google first on Android; only those that are enabled. */
export function providerOrder(): ('apple' | 'google')[] {
  const order: ('apple' | 'google')[] =
    Platform.OS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];
  return order.filter((p) => authProviders[p]);
}

/** Terms and Privacy links appear only when these are set; otherwise the words stay plain text. */
export const legalUrls = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL || null,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || null,
};

export const LAST_EMAIL_KEY = 'athleit.lastEmail';
