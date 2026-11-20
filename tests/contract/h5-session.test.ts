// @vitest-environment-options {"url":"https://h5.example.test/"}
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createH5Ports } from '../../src/data/h5';
import { request } from '../../src/data/h5/http';

function reply(code: number, data: unknown, status = 200) {
  return new Response(JSON.stringify({ code, message: 'test', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
let marker = '';
const store = {
  read: async () => marker,
  write: async (value: string) => {
    marker = value;
  },
  onChange: () => {},
};
const session = () =>
  reply(0, { tokenType: 'Bearer', accessToken: crypto.randomUUID(), expiresIn: '15m' });
beforeEach(() => {
  marker = '';
  localStorage.clear();
  vi.stubGlobal('isSecureContext', true);
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_: string, work: () => Promise<unknown>) => {
        const next = tail.then(work);
        tail = next.catch(() => {});
        return next;
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('H5 同源会话', () => {
  it('无体恢复，Cookie 只用于认证动作，Web Storage 保持空', async () => {
    const calls: { path: string; credentials: unknown; body: boolean }[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      calls.push({
        path: url.pathname,
        credentials: init.credentials,
        body: init.body !== undefined,
      });
      expect(init.redirect).toBe('error');
      expect(init.cache).toBe('no-store');
      if (url.pathname.endsWith('/refresh')) return session();
      return reply(0, {
        userId: 'u',
        username: 'member',
        memberId: 'm',
        memberNo: null,
        realName: null,
        canUseApp: true,
        appAccessReason: null,
      });
    });
    const { auth } = createH5Ports(() => {}, store);
    const s = await auth.restoreSession();
    if (!s) throw Error('未恢复');
    await auth.getCurrentMember(s);
    expect(calls).toEqual([
      { path: '/api/auth/v1/h5/refresh', credentials: 'same-origin', body: false },
      { path: '/api/app/v1/me', credentials: 'omit', body: false },
    ]);
    expect(localStorage.length).toBe(0);
    expect(/^active:[\da-f-]{36}$/.test(marker)).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });
  it('另一个标签换账号之后拒绝旧页读写与退出', async () => {
    let logouts = 0;
    vi.stubGlobal('fetch', async (url: URL) => {
      if (url.pathname.endsWith('/logout')) {
        logouts++;
        return reply(0, null);
      }
      return session();
    });
    const a = createH5Ports(() => {}, store).auth,
      b = createH5Ports(() => {}, store).auth;
    const prior = await a.restoreSession();
    if (!prior) throw Error('未恢复');
    await b.login('member', 'fixture');
    await expect(a.getCurrentMember(prior)).rejects.toMatchObject({ kind: 'unauthenticated' });
    await a.logout();
    expect(logouts).toBe(1);
  });
  it('续期回执丢失后不自动再次轮换', async () => {
    let count = 0;
    vi.stubGlobal('fetch', async () => {
      count++;
      throw new TypeError('offline');
    });
    const { auth } = createH5Ports(() => {}, store);
    await expect(auth.restoreSession()).rejects.toMatchObject({ kind: 'result-unknown' });
    expect(await auth.restoreSession()).toBeNull();
    expect(count).toBe(1);
  });
  it('拒绝跨源与路径穿越，不发请求', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    for (const path of [
      'https://other.example.test/api/app/v1/me',
      '/api/app/v1/../admin',
      '/api/auth/v1/login',
    ])
      await expect(request(path, { method: 'POST' })).rejects.toMatchObject({
        kind: 'not-configured',
      });
    expect(send).not.toHaveBeenCalled();
  });
});
