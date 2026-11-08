import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The bundled Worker is self-contained. OpenNext's intermediate server modules
// include build-time environment data and must never become public Pages assets.
const root = '.open-next';
const assets = join(root, 'assets');
if (!statSync(join(root, '_worker.js')).isFile() || !existsSync(assets)) throw new Error('Build and bundle the Worker before preparing Pages.');
const publicEntries = readdirSync(assets);
if (publicEntries.some(name => name === '_worker.js' || name === 'assets')) throw new Error('Unexpected public asset entry.');
for (const name of publicEntries) cpSync(join(assets, name), join(root, name), { recursive: true });
const keep = new Set(['_worker.js', ...publicEntries]);
for (const name of readdirSync(root)) if (!keep.has(name)) rmSync(join(root, name), { recursive: true, force: true });
console.log(`Prepared Pages: bundled Worker and ${publicEntries.length} public asset entries; private build intermediates excluded.`);
