// NEXT_PUBLIC_* must be referenced literally so Next can inline them into the browser bundle.
const on = (v: string | undefined) => v === 'true' || v === '1';

/**
 * Which social buttons this build shows. Google and Apple are disabled in supabase/config.toml until
 * real credentials exist, so a button appears only when its flag is set (README checklist).
 */
export const authProviders = {
  google: on(process.env.NEXT_PUBLIC_AUTH_GOOGLE),
  apple: on(process.env.NEXT_PUBLIC_AUTH_APPLE),
};

/** Terms and Privacy link only when these are set; otherwise the words stay plain text. */
export const legalUrls = {
  terms: process.env.NEXT_PUBLIC_TERMS_URL || null,
  privacy: process.env.NEXT_PUBLIC_PRIVACY_URL || null,
};
