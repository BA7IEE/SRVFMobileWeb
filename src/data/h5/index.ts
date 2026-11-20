import type { Ports } from '../ports';
import type { Session } from '../models';
import { fail } from '../../shared/errors';
import { createUnconfiguredPorts } from '../unconfigured';
import { capabilities, duration, me } from '../wire/auth';
import { envelope, object, text, type Transport } from '../wire/core';
import { createWire } from '../wire/operations';
import { connectMember } from './member';
import { request } from './http';

import { browserGeneration } from './generation';
const lockName = 'srvf:h5:session';
const changed = () => fail('cancelled', '登录身份已变化，请重新进入');
const ended = () => fail('unauthenticated', '请重新登录');

export function createH5Ports(
  onIdentityChange: () => void,
  markerStore = browserGeneration(),
): Ports {
  let access: { token: string; session: Session } | undefined;
  async function rotateMarker(state: 'active' | 'closed') {
    access = undefined;
    const marker = state + ':' + crypto.randomUUID();
    await markerStore.write(marker);
    return marker;
  }
  markerStore.onChange(() => {
    void markerStore
      .read()
      .then((marker) => {
        if (access && access.session.id !== marker) {
          access = undefined;
          onIdentityChange();
        }
      })
      .catch(() => {
        access = undefined;
        onIdentityChange();
      });
  });
  async function lock<T>(work: () => Promise<T>): Promise<T> {
    if (!isSecureContext || location.protocol !== 'https:' || !navigator.locks)
      throw fail(
        'service-unavailable',
        '当前浏览器无法安全协调会话，请使用支持 Web Locks 的 HTTPS 浏览器',
      );
    return navigator.locks.request(lockName, work);
  }
  async function cookie(
    action: 'login' | 'refresh' | 'logout',
    credentials?: { username: string; password: string },
  ) {
    return request('/api/auth/v1/h5/' + action, {
      method: 'POST',
      headers: credentials ? { 'Content-Type': 'application/json' } : {},
      body: credentials ? JSON.stringify(credentials) : undefined,
    });
  }
  function accept(data: unknown, marker: string): Session {
    const value = object(data);
    if (value.tokenType !== 'Bearer' || 'refreshToken' in value)
      throw fail('contract-mismatch', '会话响应与 H5 契约不符');
    const session = { id: marker, actor: '', expiresAt: Date.now() + duration(value.expiresIn) };
    access = { token: text(value.accessToken), session };
    return session;
  }
  async function recover(prior?: Session) {
    return lock(async () => {
      const marker = await markerStore.read();
      if (prior && (marker !== prior.id || access?.session.id !== marker)) throw changed();
      if (marker.startsWith('closed:')) return null;
      if (prior && access && prior !== access.session && access.session.expiresAt > Date.now())
        return access.session;
      try {
        const r = await cookie('refresh');
        if (r.status === 401 && object(r.body).code === 10007) {
          await rotateMarker('closed');
          return null;
        }
        return accept(envelope(r), marker || (await rotateMarker('active')));
      } catch (error) {
        // Response loss leaves rotation ambiguous. Require explicit login on every tab.
        await rotateMarker('closed');
        throw error;
      }
    });
  }
  function current(session?: Session) {
    if (!access || (session && session.id !== access.session.id)) throw ended();
    return access;
  }
  const transport: Transport = {
    async send(r, signal) {
      let actor = current();
      if (actor.session.id !== (await markerStore.read())) throw ended();
      if (actor.session.expiresAt <= Date.now()) {
        const next = await recover(actor.session);
        if (!next) {
          onIdentityChange();
          throw ended();
        }
        actor = current(next);
      }
      const response = await request(r.path, {
        method: r.method,
        signal,
        headers: {
          ...r.headers,
          Authorization: 'Bearer ' + actor.token,
          Accept: r.accept,
          ...(r.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: r.body === undefined ? undefined : JSON.stringify(r.body),
      });
      current(actor.session);
      if (actor.session.id !== (await markerStore.read())) throw ended();
      if (
        response.status === 401 &&
        object(response.body).code === 40100 &&
        access?.token === actor.token
      ) {
        access = undefined;
        onIdentityChange();
      }
      return response;
    },
  };
  const wire = createWire(transport, () => current().token);
  async function identify(path: string, session: Session) {
    return envelope(
      await transport.send({
        method: 'GET',
        path,
        accept: 'application/json',
        retry: 'safe-read',
        headers: { Authorization: 'Bearer ' + current(session).token },
      }),
    );
  }
  const ports = createUnconfiguredPorts();
  ports.auth = {
    getLoginOptions: () => [],
    restoreSession: () => recover(),
    async login(username, password) {
      return lock(async () => {
        await rotateMarker('closed');
        envelope(await cookie('logout'));
        const data = envelope(await cookie('login', { username, password }));
        return accept(data, await rotateMarker('active'));
      });
    },
    async refreshSession(s) {
      const next = await recover(s);
      if (!next) throw ended();
      return next;
    },
    async logout() {
      const marker = access?.session.id;
      access = undefined;
      if (!marker) return;
      return lock(async () => {
        if (marker !== (await markerStore.read())) return;
        await rotateMarker('closed');
        envelope(await cookie('logout'));
      });
    },
    async getCurrentMember(s) {
      const m = me(await identify('/api/app/v1/me', s));
      s.actor = m.userId;
      return {
        id: m.memberId ?? m.userId,
        account: m.username,
        name: m.realName,
        number: m.memberNo,
        identity: '队员',
        managed: false,
        admission:
          m.canUseApp && m.memberId
            ? 'active'
            : m.reason === 'MEMBER_NOT_LINKED'
              ? 'unbound'
              : 'inactive',
      };
    },
    async getCapabilities(s) {
      const c = capabilities(await identify('/api/app/v1/me/capabilities', s));
      if (!c.canUseApp) throw fail('forbidden', '当前成员无法使用队员端');
      return { managed: c.managed };
    },
    async changePassword(oldPassword, newPassword) {
      await wire.changePassword(oldPassword, newPassword);
    },
  };
  ports.attendance.getMyState = wire.getPunchState;
  ports.attendance.submitPunch = async (intent) => {
    const r = await wire.punch(intent);
    if (r.eventTypeCode !== intent.action) throw fail('contract-mismatch', '签到回执动作不符');
    return { id: r.eventId, action: intent.action, at: r.occurredAt, message: '已记录' };
  };
  ports.participation.getSummary = async () => {
    const r = await wire.summary();
    return { hours: r.totalServiceHours, points: r.contributionPoints, source: '本人参与汇总' };
  };
  connectMember(ports, wire);
  return ports;
}
