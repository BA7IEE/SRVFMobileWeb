import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? walk(root + '/' + e.name) : root + '/' + e.name)),
    )
  ).flat();
}
const files = (await walk('src')).filter((p) => /\.(ts|vue|css)$/.test(p));
const violations = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (
    /\bfetch\s*\(|XMLHttpRequest|new\s+(?:WebSocket|EventSource)|sendBeacon\s*\(|serviceWorker\s*\.|from\s*['"]axios/.test(
      source,
    )
  )
    violations.push(file + ': forbidden network primitive');
  if (/from\s*['"][^'"]*(?:admin|utils\/http|utils\/auth)/.test(source))
    violations.push(file + ': admin import');
  if (
    !file.includes('/data/mock/') &&
    !file.includes('/devtools/') &&
    file !== 'src/data/index.ts' &&
    /import[^;]*(?:mock\/|fixtures|scenarios)/.test(source)
  )
    violations.push(file + ': fixture access outside adapter');
  if (/\/my\/activities\/[^'" ]*\/check-in|check-in-location|attendance-sheet/.test(source))
    violations.push(file + ': retired workflow');
  if (/\bv-html\b|\beval\s*\(|as any\b|@ts-ignore|@ts-nocheck/.test(source))
    violations.push(file + ': unsafe bypass');
}
assert.deepEqual(violations, []);
console.log(
  `PASS boundaries: ${files.length} source files; no network transport or retired/admin imports`,
);
