import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('contracts/manifest.json', 'utf8'));
assert.equal(manifest.backend.sha, 'fcf4e5d5802c42a1503b205751f737e3badd6ffc');
assert.equal(manifest.brand.blob, '7295d168e2a15e140c5a522456246a6a4736f88d');
for (const entry of manifest.files) {
  const bytes = await readFile(entry.file);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    entry.file + ': snapshot drift',
  );
  assert.ok(entry.sourceBlob && entry.ranges.length && entry.sourceSha256);
}
const coverage = JSON.parse(await readFile('contracts/capabilities.json', 'utf8'));
assert.ok(coverage.length >= 30);
for (const row of coverage) {
  assert.ok(row.port && row.readiness && row.resolution && row.retryPolicy);
  if (row.endpoint !== 'UNCONFIRMED') {
    assert.ok(
      manifest.files.some((f) => f.sourcePath === row.sourcePath),
      row.port + ': missing source',
    );
    assert.ok(row.sourceRef.includes(manifest.backend.sha));
  } else assert.equal(row.readiness, 'MOCK_ONLY');
  assert.notEqual(row.readiness, 'LIVE_VERIFIED');
}
console.log(
  `PASS ${manifest.files.length} pinned source slices; ${coverage.length} capability rows; no remote lookup`,
);
