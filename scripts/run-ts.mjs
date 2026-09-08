import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs one TypeScript file. The project has no ts-node and does not need one:
 * esbuild is already here for the tests, and bundling to a temporary file is
 * the whole of it.
 */
const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <file.ts>');
  process.exit(1);
}

const outfile = join(mkdtempSync(join(tmpdir(), 'savvypiggy-')), 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' });
await import(`file://${outfile}`);
