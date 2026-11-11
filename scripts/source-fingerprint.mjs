import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function files(root) {
  return (
    await Promise.all(
      (await readdir(root, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(root + '/' + e.name) : root + '/' + e.name,
      ),
    )
  ).flat();
}
export async function fingerprint() {
  const paths = [
    ...(await files('src')),
    'package.json',
    'pnpm-lock.yaml',
    'vite.config.ts',
    '.env.mock',
    '.env.production',
  ].sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path);
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
}
