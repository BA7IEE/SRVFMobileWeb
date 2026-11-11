import {
  bool,
  DeliveryError,
  envelope,
  iso,
  nullableText,
  object,
  text,
  type Transport,
} from './core';
import { fail } from '../../shared/errors';
import { loginErrors } from '../../shared/validation';
export type Credentials = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  refreshToken: string;
  refreshExpiresAt: string;
  accessExpiresAt: number;
};
export interface CredentialStore {
  read(): Credentials | undefined;
  replace(value: Credentials): void;
  clear(): void;
}
export class MemoryCredentialStore implements CredentialStore {
  private value?: Credentials;
  read() {
    return this.value ? { ...this.value } : undefined;
  }
  replace(value: Credentials) {
    this.value = { ...value };
  }
  clear() {
    this.value = undefined;
  }
}
export function duration(value: unknown) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)$/.exec(text(value));
  if (!match) throw fail('contract-mismatch', 'expiresIn 时长无法解析');
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
    y: 31557600000,
  };
  const n = Number(match[1]) * units[match[2]!]!;
  if (!Number.isFinite(n) || n < 1 || n > 31557600000)
    throw fail('contract-mismatch', 'expiresIn 超出客户端时长边界');
  return n;
}
export function credentials(value: unknown, now: number): Credentials {
  const o = object(value);
  if (o.tokenType !== 'Bearer') throw fail('contract-mismatch', '凭证类型无效');
  return {
    accessToken: text(o.accessToken),
    tokenType: 'Bearer',
    expiresIn: text(o.expiresIn),
    refreshToken: text(o.refreshToken),
    refreshExpiresAt: iso(o.refreshExpiresAt),
    accessExpiresAt: now + duration(o.expiresIn),
  };
}
export function me(value: unknown) {
  const o = object(value);
  const canUseApp = bool(o.canUseApp);
  const reason = nullableText(o.appAccessReason);
  if (
    reason !== null &&
    !['MEMBER_NOT_LINKED', 'MEMBER_INACTIVE', 'MEMBER_DELETED'].includes(reason)
  )
    throw fail('contract-mismatch', '未知成员准入状态');
  return {
    userId: text(o.userId),
    username: text(o.username),
    memberId: nullableText(o.memberId),
    memberNo: nullableText(o.memberNo),
    realName: nullableText(o.realName),
    canUseApp,
    reason,
  };
}
export function capabilities(value: unknown) {
  const o = object(value);
  const account = object(o.account);
  const managed = object(o.managed);
  return { canUseApp: bool(account.canUseApp), managed: bool(managed.canViewManagedActivities) };
}
/** Each instance belongs to one independent tab/family. It never replays submitted writes. */
export class WireAuthCoordinator {
  private epoch = 0;
  private flight?: Promise<void>;
  constructor(
    private transport: Transport,
    readonly store: CredentialStore,
    private clock: () => number = Date.now,
  ) {}
  async login(username: string, password: string) {
    const errors = loginErrors(username, password);
    if (errors.account || errors.password)
      throw fail('validation', errors.account || errors.password);
    const epoch = ++this.epoch;
    this.store.clear();
    const r = await this.transport.send({
      method: 'POST',
      path: '/api/auth/v1/login',
      body: { username: username.trim(), password },
      accept: 'application/json',
      retry: 'none',
    });
    if (epoch !== this.epoch) throw fail('cancelled', '身份已切换');
    const c = credentials(envelope(r), this.clock());
    const m = me(
      envelope(
        await this.transport.send({
          method: 'GET',
          path: '/api/app/v1/me',
          headers: { Authorization: `Bearer ${c.accessToken}` },
          accept: 'application/json',
          retry: 'safe-read',
        }),
      ),
    );
    if (epoch !== this.epoch) throw fail('cancelled', '身份已切换');
    const caps = capabilities(
      envelope(
        await this.transport.send({
          method: 'GET',
          path: '/api/app/v1/me/capabilities',
          headers: { Authorization: `Bearer ${c.accessToken}` },
          accept: 'application/json',
          retry: 'safe-read',
        }),
      ),
    );
    if (epoch !== this.epoch) throw fail('cancelled', '身份已切换');
    if (!m.canUseApp || !caps.canUseApp) throw fail('forbidden', '当前成员不可准入');
    this.store.replace(c);
    return m;
  }
  refresh(signal?: AbortSignal) {
    if (this.flight) return this.flight;
    const current = this.store.read();
    if (!current) return Promise.reject(fail('unauthenticated', '请重新认证'));
    const epoch = this.epoch;
    this.flight = (async () => {
      try {
        const r = await this.transport.send(
          {
            method: 'POST',
            path: '/api/auth/v1/refresh',
            body: { refreshToken: current.refreshToken },
            accept: 'application/json',
            retry: 'none',
          },
          signal,
        );
        if (signal?.aborted) throw fail('cancelled', '续期已取消');
        const next = credentials(envelope(r), this.clock());
        if (next.refreshExpiresAt !== current.refreshExpiresAt)
          throw fail('contract-mismatch', '刷新 family 绝对到期发生变化');
        if (epoch !== this.epoch) throw fail('cancelled', '身份已切换');
        this.store.replace(next);
      } catch (e) {
        if (e instanceof DeliveryError && e.delivery === 'not-sent')
          throw fail('network', '续期明确未发出，可稍后重新确认');
        if (epoch === this.epoch) this.store.clear();
        if (e instanceof DeliveryError)
          throw fail('result-unknown', '续期可能已完成，请重新认证，不再自动使用旧凭证');
        throw e;
      } finally {
        if (epoch === this.epoch) this.flight = undefined;
      }
    })();
    return this.flight;
  }
  async logout() {
    const prior = this.store.read();
    this.epoch++;
    this.store.clear();
    this.flight = undefined;
    if (prior)
      envelope(
        await this.transport.send({
          method: 'POST',
          path: '/api/auth/v1/logout',
          body: { refreshToken: prior.refreshToken },
          accept: 'application/json',
          retry: 'none',
        }),
      );
  }
}
