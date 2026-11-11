import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fingerprint } from './source-fingerprint.mjs';
const digest = await fingerprint();
for (const [mode, dir] of [
  ['unconfigured', 'dist'],
  ['mock', 'dist-mock'],
]) {
  let stamp;
  try {
    stamp = JSON.parse(await readFile(`${dir}/.source-stamp.json`, 'utf8'));
  } catch {
    /* 首次执行需构建 */
  }
  if (stamp?.fingerprint !== digest || stamp?.mode !== mode) {
    const built = spawnSync(process.execPath, ['scripts/build.mjs', mode], { stdio: 'inherit' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
}
const args = ['exec', 'playwright', 'test'];
if (process.argv[2] === 'tokens') args.push('tests/e2e/tokens.spec.ts', '--project=chromium');
const run = spawnSync('pnpm', args, { stdio: 'inherit' });
process.exit(run.status ?? 1);
