export const APP_NAME = 'Athleit';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt limit used by Supabase Auth
export const MAX_DISPLAY_NAME_LENGTH = 80; // matches profiles_display_name_length

/** OAuth providers wired up in Phase 0 (credentials supplied later). */
export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
