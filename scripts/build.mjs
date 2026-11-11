import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fingerprint } from './source-fingerprint.mjs';
const mode = process.argv[2];
if (!['mock', 'unconfigured'].includes(mode)) throw new Error('invalid build mode');
if (process.env.VITE_DATA_SOURCE && process.env.VITE_DATA_SOURCE !== mode)
  throw new Error('外部环境与显式构建模式冲突');
const result = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', '--mode', mode === 'mock' ? 'mock' : 'production'],
  { stdio: 'inherit', env: { ...process.env, VITE_DATA_SOURCE: mode, SRVF_EXPLICIT_BUILD: mode } },
);
if (result.status === 0)
  await writeFile(
    `${mode === 'mock' ? 'dist-mock' : 'dist'}/.source-stamp.json`,
    JSON.stringify({ fingerprint: await fingerprint(), mode }) + '\n',
  );
process.exit(result.status ?? 1);
