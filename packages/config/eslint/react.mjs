import reactHooks from 'eslint-plugin-react-hooks';

import base from './base.mjs';

/** Base config plus the React Hooks rules (used by apps/mobile; web gets them from eslint-config-next). */
export default [...base, reactHooks.configs.flat.recommended];
