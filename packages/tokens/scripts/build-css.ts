import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildContrastDoc, buildThemeCss } from '../src/css';

const root = new URL('../', import.meta.url);
writeFileSync(fileURLToPath(new URL('theme.css', root)), buildThemeCss());
writeFileSync(fileURLToPath(new URL('CONTRAST.md', root)), buildContrastDoc());
console.log('Wrote theme.css and CONTRAST.md');
