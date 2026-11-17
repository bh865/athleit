import { defineConfig } from 'vitest/config';

// Edge Function modules import zod as `npm:zod@x` (Deno); resolve it to the workspace copy under test.
export default defineConfig({
  resolve: { alias: { 'npm:zod@4.6.7': 'zod' } },
  test: { include: ['src/**/*.test.ts'] },
});
