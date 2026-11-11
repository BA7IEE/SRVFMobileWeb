import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
async function files(root) {
  return (
    await Promise.all(
      (await readdir(root, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(root + '/' + e.name) : root + '/' + e.name,
      ),
    )
  ).flat();
}
const evidence = {};
for (const dir of ['dist', 'dist-mock']) {
  const paths = await files(dir);
  let gzip = 0;
  let scannerGzip = 0;
  let text = '';
  for (const path of paths) {
    const buf = await readFile(path);
    assert.ok(!path.endsWith('.map'), 'source map published');
    if (/\.(js|css)$/.test(path)) {
      const size = gzipSync(buf).length;
      gzip += size;
      if (/jsQR-/.test(path)) scannerGzip += size;
    }
    text += buf.toString('utf8');
  }
  if (dir === 'dist') {
    for (const forbidden of [
      'demo-only',
      'demo_a',
      'DEMO-001',
      'SRVF-DEMO:',
      'AUTH-01',
      '打开演示场景面板',
      'mock-assets',
    ])
      assert.ok(!text.includes(forbidden), `ordinary bundle leaked: ${forbidden}`);
    assert.ok(text.includes('服务尚未接通'));
  } else {
    assert.ok(text.includes('SRVF-DEMO:'));
    assert.ok(text.includes('演示模式'));
  }
  assert.ok(
    gzip - scannerGzip < 350 * 1024,
    `${dir}: exceeds 350 KiB conservative all-chunk budget`,
  );
  evidence[dir] = {
    files: paths.length,
    allJsCssGzip: gzip,
    decoderGzip: scannerGzip,
    withoutDecoderGzip: gzip - scannerGzip,
  };
}
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/bundle.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('PASS bundles', evidence);
