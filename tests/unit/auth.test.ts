import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMockPorts } from '../../src/data/mock';
import type { Ports } from '../../src/data/ports';
import { useAuth } from '../../src/features/auth/store';
const context = vi.hoisted(() => ({ ports: undefined as Ports | undefined }));
vi.mock('../../src/data', () => ({ getData: () => context.ports! }));
beforeEach(() => {
  sessionStorage.clear();
  context.ports = createMockPorts();
  setActivePinia(createPinia());
});
describe('会话生命周期', () => {
  it('错误密码不创建身份，保留可见错误反馈', async () => {
    const auth = useAuth();
    await expect(auth.login('demo_a', 'wrong')).rejects.toHaveProperty('kind', 'unauthenticated');
    expect(auth.state).toBe('anonymous');
    expect(auth.message).toContain('不正确');
    expect(auth.member).toBeUndefined();
  });
  it('登录完成独立身份与能力读取，阻止未绑定', async () => {
    const auth = useAuth();
    await auth.login('demo_unbound', 'demo-only');
    expect(auth.state).toBe('blocked');
    expect(auth.ready).toBe(false);
  });
  it('并发 5 次续期只执行一次；family 绝对到期不延长', async () => {
    const auth = useAuth();
    await auth.login('demo_a', 'demo-only');
    const absolute = auth.session!.refreshExpiresAt;
    await Promise.all(Array.from({ length: 5 }, () => auth.refresh()));
    expect(context.ports!.controls!.refreshCount()).toBe(1);
    expect(auth.session!.refreshExpiresAt).toBe(absolute);
  });
  it('退出后的旧续期不恢复身份或存储', async () => {
    const auth = useAuth();
    await auth.login('demo_a', 'demo-only');
    const old = auth.refresh().catch(() => {});
    await auth.logout();
    await old;
    expect(auth.state).toBe('anonymous');
    expect(auth.member).toBeUndefined();
    expect(sessionStorage.getItem('srvf:mock:v1:session')).toBeNull();
  });
  it('过期清理；临时失败不当成已授权', async () => {
    const auth = useAuth();
    await auth.login('demo_a', 'demo-only');
    context.ports!.controls!.apply('AUTH-UNAVAILABLE');
    await expect(auth.refresh()).rejects.toHaveProperty('kind', 'network');
    expect(auth.state).toBe('unavailable');
    context.ports!.controls!.apply('AUTH-04');
    await expect(auth.refresh()).rejects.toHaveProperty('kind', 'unauthenticated');
    expect(auth.state).toBe('expired');
    expect(auth.member).toBeUndefined();
  });
  it('取消与回执丢失都让所有等待者结束', async () => {
    const auth = useAuth();
    await auth.login('demo_a', 'demo-only');
    context.ports!.controls!.apply('AUTH-10');
    const settled = await Promise.allSettled(Array.from({ length: 5 }, () => auth.refresh()));
    expect(settled.every((r) => r.status === 'rejected')).toBe(true);
    context.ports!.controls!.apply('AUTH-11');
    await expect(auth.refresh()).rejects.toHaveProperty('kind', 'unauthenticated');
    expect(context.ports!.controls!.refreshCount()).toBe(2);
  });
  it('重复恢复只运行一次且不读损坏数据', async () => {
    const auth = useAuth();
    const spy = vi.spyOn(context.ports!.auth, 'restoreSession');
    await Promise.all([auth.restoreSession(), auth.restoreSession()]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(auth.state).toBe('anonymous');
  });
  it('新标签页恢复独立 family，旧页退出不会复活', async () => {
    const p = context.ports!;
    const original = await p.auth.login('demo_a', 'demo-only');
    const other = createMockPorts();
    const restored = await other.auth.restoreSession();
    expect(restored!.id).not.toBe(original.id);
    await p.auth.logout();
    await expect(p.auth.getCurrentMember(original)).resolves.toHaveProperty('id', 'member-a');
    expect(await other.auth.restoreSession()).toBeNull();
  });
});
