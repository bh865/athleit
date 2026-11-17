import base from '@athleit/config/eslint/base';
import design from '@athleit/config/eslint/design';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...base,
  ...design,
  globalIgnores(['.next/**', 'next-env.d.ts']),
]);
