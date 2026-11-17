import type { Database } from './database.types';

export type { Session, User } from '@supabase/supabase-js';
export type { Database, Json } from './database.types';

type PublicSchema = Database['public'];

/** Row type for a public table, e.g. `Tables<'profiles'>`. */
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];

export type Profile = Tables<'profiles'>;
