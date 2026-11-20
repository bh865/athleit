// Posts the staleness JSON (from `pnpm docs:check --stale --json`) to the report-docs-status Edge Function with an HMAC.
// Env: DOCS_STATUS_URL, DOCS_STATUS_SECRET. Usage: node scripts/docs-report.mjs stale.json
import crypto from 'node:crypto';
import fs from 'node:fs';

const url = process.env.DOCS_STATUS_URL;
const secret = process.env.DOCS_STATUS_SECRET;
if (!url || !secret) {
  console.log(
    'DOCS_STATUS_URL or DOCS_STATUS_SECRET is not set: not reporting to the admin Articles page.',
  );
  process.exit(0);
}
const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const body = JSON.stringify({ items });
const ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-docs-timestamp': ts, 'x-docs-signature': sig },
  body,
});
console.log(`report-docs-status: ${res.status}`);
process.exit(res.ok ? 0 : 1);
