import { readFileSync, writeFileSync } from 'node:fs';
const file = '.open-next/_worker.js';
let code = readFileSync(file, 'utf8');
if (!/__ASSETS_RUN_WORKER_FIRST__: (false|true)/.test(code)) {
  throw new Error('Cloudflare asset-routing marker is missing. Refusing to emit an unverified deployment bundle.');
}
code = code.replace(/__ASSETS_RUN_WORKER_FIRST__: false/g, '__ASSETS_RUN_WORKER_FIRST__: true');
if (!code.includes('SPILL_PRIVATE_ARTIFACT_GUARD')) {
  const entry = /var worker_default = \{\s+async fetch\((\w+), (\w+), (\w+)\) \{/;
  if (!entry.test(code)) throw new Error('Cloudflare fetch entry is missing. Refusing to emit an unguarded deployment.');
  code = code.replace(entry, (match, request) => `${match}
    // SPILL_PRIVATE_ARTIFACT_GUARD: deny build intermediates before asset caches.
    let spillPath;
    try { spillPath = decodeURIComponent(new URL(${request}.url).pathname); }
    catch { return new Response('Not found', { status: 404 }); }
    if (/^\\/(?:\\.build|cache|cloudflare|cloudflare-templates|dynamodb-provider|middleware|server-functions)(?:\\/|$)|^\\/_?worker\\.js(?:\\/|$)/.test(spillPath)) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }`);
}
writeFileSync(file, code);
console.log('Patched Worker-first asset routing and private-artifact guard');
