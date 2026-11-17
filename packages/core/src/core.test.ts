import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  fieldErrors,
  parseEnv,
  signInSchema,
  signUpSchema,
  supabasePublicEnvSchema,
  updateProfileSchema,
} from './index';

describe('signUpSchema', () => {
  it('accepts valid input and normalises the email', () => {
    const r = signUpSchema.parse({
      displayName: '  Casey Coach ',
      email: ' Casey@Example.com ',
      password: 'correct horse',
    });
    expect(r).toEqual({
      displayName: 'Casey Coach',
      email: 'casey@example.com',
      password: 'correct horse',
    });
  });

  it('reports per-field errors', () => {
    const r = signUpSchema.safeParse({ displayName: '', email: 'nope', password: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(fieldErrors(r.error)).sort()).toEqual([
        'displayName',
        'email',
        'password',
      ]);
    }
  });
});

describe('signInSchema', () => {
  it('does not apply the sign-up password policy', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
  it('requires a password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('only allows display_name and avatar_url', () => {
    expect(updateProfileSchema.parse({ display_name: 'Sam', id: 'ignored' })).toEqual({
      display_name: 'Sam',
    });
  });
});

describe('parseEnv', () => {
  const names = { url: 'NEXT_PUBLIC_SUPABASE_URL', anonKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' };

  it('returns parsed values', () => {
    expect(
      parseEnv(supabasePublicEnvSchema, { url: 'http://127.0.0.1:54321', anonKey: 'k' }, names),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'k',
    });
  });

  it('names the env vars that are wrong', () => {
    expect(() => parseEnv(supabasePublicEnvSchema, { url: 'nope' }, names)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it('works with arbitrary schemas', () => {
    const schema = z.object({ port: z.coerce.number().int() });
    expect(parseEnv(schema, { port: '3000' }, { port: 'PORT' })).toEqual({ port: 3000 });
  });
});
