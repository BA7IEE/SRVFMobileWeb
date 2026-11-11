import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
describe('构建数据源边界', () => {
  it('普通build拒绝外部环境偷偷启用mock', () => {
    const r = spawnSync('pnpm', ['build'], {
      encoding: 'utf8',
      env: { ...process.env, VITE_DATA_SOURCE: 'mock' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('外部环境与显式构建模式冲突');
  });
  it('显式api模式立即报错，不建立网络或回退演示', () => {
    const r = spawnSync('pnpm', ['exec', 'vite', 'build', '--mode', 'mock'], {
      encoding: 'utf8',
      env: { ...process.env, VITE_DATA_SOURCE: 'api' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('真实网络传输禁止启用');
  });
});
