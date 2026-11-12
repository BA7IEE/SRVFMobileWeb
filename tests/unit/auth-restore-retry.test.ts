import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMockPorts } from '../../src/data/mock';
import type { Ports } from '../../src/data/ports';
import type { CurrentMember } from '../../src/data/models';
import { useAuth } from '../../src/features/auth/store';
import { fail } from '../../src/shared/errors';
const context = vi.hoisted(() => ({ ports: undefined as Ports | undefined }));
vi.mock('../../src/data', () => ({ getData: () => context.ports! }));
beforeEach(async () => {
  sessionStorage.clear();
  context.ports = createMockPorts();
  await context.ports.auth.login('demo_a', 'demo-only');
  setActivePinia(createPinia());
});

describe('R2：启动失败后的真正重试', () => {
  it.each(['getCurrentMember', 'getCapabilities'] as const)(
    '%s暂时失败后显式重试重新恢复',
    async (method) => {
      const auth = useAuth();
      const ports = context.ports!;
      const restore = vi.spyOn(ports.auth, 'restoreSession');
      vi.spyOn(ports.auth, method).mockRejectedValueOnce(fail('network', '合成暂时读取失败'));
      await auth.restoreSession();
      expect(auth.state).toBe('unavailable');
      expect(auth.session).toBeUndefined();
      await auth.revalidate();
      expect(restore).toHaveBeenCalledTimes(2);
      expect(auth.ready).toBe(true);
      expect(auth.member?.id).toBe('member-a');
    },
  );
  it('五个无session的重试共享一次恢复，成功后不重复初始化', async () => {
    const ports = context.ports!;
    const auth = useAuth();
    const restore = vi.spyOn(ports.auth, 'restoreSession');
    vi.spyOn(ports.auth, 'getCurrentMember').mockRejectedValueOnce(
      fail('network', '合成暂时读取失败'),
    );
    await auth.restoreSession();
    await Promise.all(Array.from({ length: 5 }, () => auth.revalidate()));
    expect(restore).toHaveBeenCalledTimes(2);
    expect(auth.ready).toBe(true);
    await auth.restoreSession();
    expect(restore).toHaveBeenCalledTimes(2);
  });
  it.each(['unbound', 'inactive'] as const)('重试后%s仍必须经过成员准入', async (admission) => {
    const ports = context.ports!;
    const auth = useAuth();
    const blocked: CurrentMember = {
      id: 'synthetic-blocked',
      account: 'synthetic_blocked',
      name: '合成不可用成员',
      number: null,
      identity: '未准入',
      admission,
      managed: false,
    };
    vi.spyOn(ports.auth, 'getCurrentMember')
      .mockRejectedValueOnce(fail('network', '合成暂时读取失败'))
      .mockResolvedValueOnce(blocked);
    await auth.restoreSession();
    await auth.revalidate();
    expect(auth.state).toBe('blocked');
    expect(auth.ready).toBe(false);
    expect(auth.session).toBeUndefined();
  });
  it('重试读身份期间退出，晚到结果不能再读能力或恢复旧账号', async () => {
    const ports = context.ports!;
    const auth = useAuth();
    let release!: (member: CurrentMember) => void;
    const current = await ports.auth.getCurrentMember((await ports.auth.restoreSession())!);
    const capabilities = vi.spyOn(ports.auth, 'getCapabilities');
    vi.spyOn(ports.auth, 'getCurrentMember')
      .mockRejectedValueOnce(fail('network', '合成暂时读取失败'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    await auth.restoreSession();
    const retry = auth.revalidate();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await auth.logout();
    release(current);
    await retry;
    expect(auth.state).toBe('anonymous');
    expect(auth.member).toBeUndefined();
    expect(capabilities).not.toHaveBeenCalled();
  });
});
