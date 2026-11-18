import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs script without types
import { transform } from '../../../scripts/sync-edge-registration.mjs';

const root = join(__dirname, '../../..');

describe('edge copy of the registration validation', () => {
  it.each(['registration.ts', 'schemas/registration.ts'])(
    '%s matches packages/core (run `node scripts/sync-edge-registration.mjs` to refresh)',
    (f) => {
      const src = readFileSync(join(root, 'packages/core/src', f), 'utf8');
      const copy = readFileSync(
        join(root, 'supabase/functions/_shared/registration/core', f),
        'utf8',
      );
      expect(copy).toBe(transform(src));
    },
  );
});
