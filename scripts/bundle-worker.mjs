import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = '.open-next';
const outDir = 'dist';

// Read the worker.js entry point
const entryFile = join(outputDir, 'worker.js');

const result = await esbuild.build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'esm',
  target: 'esnext',
  platform: 'node',
  write: false,
  minify: false,
  legalComments: 'none',
  define: {
    'process.env.NEXT_RUNTIME': '"nodejs"',
    'process.env.NODE_ENV': '"production"',
  },
  metafile: true,
});

// Post-process: prefix bare Node.js built-ins with 'node:'
let code = result.outputFiles[0].text;
const builtins = ['async_hooks', 'assert', 'buffer', 'crypto', 'path', 'stream', 'url', 'util', 'zlib'];
for (const mod of builtins) {
  const re = new RegExp(`from "${mod}"`, 'g');
  code = code.replace(re, `from "node:${mod}"`);
}

writeFileSync(join(outDir, 'worker.js'), code);
writeFileSync(join(outDir, 'worker.meta.json'), JSON.stringify(result.metafile, null, 2));
console.log(`Bundled worker: ${outDir}/worker.js (${code.length} bytes)`);
