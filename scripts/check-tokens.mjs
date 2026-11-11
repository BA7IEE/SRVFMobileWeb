import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const files = [
  'src/styles/tokens.brand.css',
  'src/styles/tokens.mobile.css',
  'src/styles/vant-theme.css',
  'src/styles/base.css',
];
const styles = await Promise.all(files.map((p) => readFile(p, 'utf8')));
const all = styles.join('\n');
for (const [token, value] of Object.entries({
  'srvf-red': '#c4001b',
  'srvf-navy': '#19478a',
  'srvf-red-deep': '#9a0014',
  'srvf-gold': '#c9a24a',
}))
  assert.match(styles[0], new RegExp('--' + token + ':\\s*' + value));
const definitions = new Set([...all.matchAll(/(--srvf-[a-z-]+)\s*:/g)].map((x) => x[1]));
for (const match of all.matchAll(/var\((--srvf-[a-z-]+)/g))
  assert.ok(definitions.has(match[1]), `undefined: ${match[1]}`);
assert.ok(
  !styles
    .slice(2)
    .join('')
    .match(/#[0-9a-f]{3,8}\b/i),
  'hardcoded color outside token files',
);
assert.ok(!all.includes('--el-'));
function luminance(hex) {
  return hex
    .match(/[0-9a-f]{2}/gi)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((n, x, i) => n + x * [0.2126, 0.7152, 0.0722][i], 0);
}
const pairs = ['#c4001b', '#19478a', '#5e6a80', '#21633e', '#805000'];
for (const color of pairs) {
  const contrast = (1 + 0.05) / (luminance(color) + 0.05);
  assert.ok(contrast >= 4.5, color + ': ' + contrast);
}
console.log(
  'PASS brand values, references, palette boundaries and 5 foreground contrasts; computed Vant styles follow in browser',
);
