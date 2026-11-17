import design from '@athleit/config/eslint/design';
import react from '@athleit/config/eslint/react';

export default [{ ignores: ['metro.config.js'] }, ...react, ...design];
