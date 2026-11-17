import base from '@athleit/config/eslint/base';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...base,
  globalIgnores(['.next/**', 'next-env.d.ts']),
]);
