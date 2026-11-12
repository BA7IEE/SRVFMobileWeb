import { describe, expect, it } from 'vitest';
import { credentials, MemoryCredentialStore, WireAuthCoordinator } from '../../src/data/wire/auth';
import { DeliveryError, FakeTransport, type WireResponse } from '../../src/data/wire/core';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const ok = (data: unknown): WireResponse => ({
  status: 200,
  contentType: 'application/json',
  body: { code: 0, message: 'ok', data },
});
const token = (name: string) => ({
  accessToken: 'SYNTHETIC_ACCESS_' + name,
  refreshToken: 'SYNTHETIC_REFRESH_' + name,
  tokenType: 'Bearer',
  expiresIn: '15m',
  refreshExpiresAt: '2099-01-01T00:00:00Z',
});
const profile = {
  userId: 'user-b',
  username: 'synthetic_b',
  memberId: 'member-b',
  memberNo: 'SYNTHETIC-B',
  realName: '合成队员B',
  canUseApp: true,
  appAccessReason: null,
};
const capabilities = { account: { canUseApp: true }, managed: { canViewManagedActivities: false } };

describe('R1：没有先退出的重叠登录', () => {
  it.each(['success', 'failure'] as const)(
    '旧续期%s晚到，不能占用或清除新会话的续期',
    async (outcome) => {
      const oldReply = deferred<WireResponse>();
      const newReply = deferred<WireResponse>();
      const transport = new FakeTransport([
        () => oldReply.promise,
        ok(token('B')),
        ok(profile),
        ok(capabilities),
        () => newReply.promise,
      ]);
      const store = new MemoryCredentialStore();
      store.replace(credentials(token('A'), 0));
      const auth = new WireAuthCoordinator(transport, store);
      const old = auth.refresh();
      const oldResult = old.catch((error) => error);
      await auth.login('synthetic_b', 'synthetic-password');
      const next = auth.refresh();
      const waiting = auth.refresh();
      if (outcome === 'success') oldReply.resolve(ok(token('A_LATE')));
      else oldReply.reject(new DeliveryError('unknown'));
      const oldError = await oldResult;
      const afterOldSettles = auth.refresh();
      newReply.resolve(ok(token('B_NEXT')));
      const results = await Promise.allSettled([next, waiting, afterOldSettles]);
      expect(next).not.toBe(old);
      expect(waiting).toBe(next);
      expect(afterOldSettles).toBe(next);
      expect(oldError).toHaveProperty('kind', 'cancelled');
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(transport.requests.filter((r) => r.path.endsWith('/refresh'))).toHaveLength(2);
      expect(store.read()).toMatchObject({
        accessToken: 'SYNTHETIC_ACCESS_B_NEXT',
        refreshToken: 'SYNTHETIC_REFRESH_B_NEXT',
      });
    },
  );
  it('新登录失败后不能复用旧续期或恢复旧凭证', async () => {
    const oldReply = deferred<WireResponse>();
    const transport = new FakeTransport([
      () => oldReply.promise,
      {
        status: 401,
        contentType: 'application/json',
        body: { code: 10004, message: '合成错误', data: null },
      },
    ]);
    const store = new MemoryCredentialStore();
    store.replace(credentials(token('A'), 0));
    const auth = new WireAuthCoordinator(transport, store);
    const old = auth.refresh();
    const oldResult = old.catch((error) => error);
    await expect(auth.login('synthetic_b', 'wrong')).rejects.toHaveProperty(
      'kind',
      'unauthenticated',
    );
    const next = auth.refresh();
    const nextResult = next.catch((error) => error);
    oldReply.resolve(ok(token('A_LATE')));
    expect(await oldResult).toHaveProperty('kind', 'cancelled');
    expect(await nextResult).toHaveProperty('kind', 'unauthenticated');
    expect(next).not.toBe(old);
    expect(store.read()).toBeUndefined();
  });
});
