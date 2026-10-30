import { readFileSync, writeFileSync } from 'node:fs';
const file = '.open-next/_worker.js';
let code = readFileSync(file, 'utf8');
code = code.replace(/__ASSETS_RUN_WORKER_FIRST__: false/g, '__ASSETS_RUN_WORKER_FIRST__: true');
writeFileSync(file, code);
console.log('Patched __ASSETS_RUN_WORKER_FIRST__ to true');
