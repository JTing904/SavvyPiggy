// Bundles each tests/*.test.ts with esbuild and runs it on plain node, so the
// pure logic (money, recurrence) is testable without a browser or emulator.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const outDir = mkdtempSync(path.join(os.tmpdir(), 'savvypiggy-tests-'));
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: true });

let failed = false;
try {
  for (const file of readdirSync('tests').filter((f) => f.endsWith('.test.ts'))) {
    const out = path.join(outDir, file.replace(/\.ts$/, '.mjs'));
    const build = run('npx', ['esbuild', `tests/${file}`, '--bundle', '--format=esm',
      '--platform=node', `--outfile=${out}`, '--log-level=error']);
    if (build.status !== 0) { failed = true; continue; }

    console.log(`\n--- ${file} ---`);
    if (run('node', [out]).status !== 0) failed = true;
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
