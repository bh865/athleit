#!/usr/bin/env node
// Mobile e2e coverage gate. Every screen file under apps/mobile/src/app must be named by at least one Maestro
// flow through a `# covers: <route>` comment (several routes may be listed, comma separated), and every route a
// flow names must exist. A route that genuinely cannot be driven on a simulator goes in
// apps/mobile/.maestro/not-testable.json with a reason, so the gap is written down rather than silent.
// Usage: node scripts/mobile-e2e-coverage.mjs [--list]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const appDir = join(root, 'apps/mobile/src/app');
const flowDir = join(root, 'apps/mobile/.maestro');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const routes = walk(appDir)
  .filter((f) => f.endsWith('.tsx') && !/_layout\.tsx$/.test(f))
  .map((f) =>
    '/' +
    relative(appDir, f)
      .replace(/\.tsx$/, '')
      .split('/')
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .join('/')
      .replace(/\/index$/, '')
      .replace(/^index$/, ''),
  )
  .map((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))
  .sort();

const covered = new Map();
if (existsSync(flowDir)) {
  for (const f of walk(flowDir).filter((x) => x.endsWith('.yaml'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/^#\s*covers:\s*(.+)$/gm)) {
      for (const r of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        covered.set(r, [...(covered.get(r) ?? []), relative(flowDir, f)]);
      }
    }
  }
}
const waived = existsSync(join(flowDir, 'not-testable.json'))
  ? JSON.parse(readFileSync(join(flowDir, 'not-testable.json'), 'utf8'))
  : {};

const missing = routes.filter((r) => !covered.has(r) && !waived[r]);
const unknown = [...covered.keys()].filter((r) => !routes.includes(r));
if (process.argv.includes('--list')) for (const r of routes) console.log(r.padEnd(40), covered.get(r)?.join(', ') ?? (waived[r] ? `WAIVED: ${waived[r]}` : '-- none --'));
console.log(`routes ${routes.length}, covered ${routes.filter((r) => covered.has(r)).length}, waived ${Object.keys(waived).length}, missing ${missing.length}`);
if (unknown.length) console.error('flows name routes that do not exist:', unknown.join(', '));
if (missing.length) console.error('no flow covers:', missing.join(', '));
process.exit(missing.length || unknown.length ? 1 : 0);
