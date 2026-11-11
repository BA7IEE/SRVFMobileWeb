import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  FakeTransport,
  DeliveryError,
  envelope,
  svg,
  decimalString,
  iso,
  page,
} from '../../src/data/wire/core';
import type { WireResponse } from '../../src/data/wire/core';
import {
  credentials,
  duration,
  MemoryCredentialStore,
  WireAuthCoordinator,
} from '../../src/data/wire/auth';
import {
  createWire,
  insuranceBody,
  punchBody,
  registrationBody,
  punchState,
} from '../../src/data/wire/operations';
import { IntentRegistry } from '../../src/shared/composables/intent';
const at = '2026-11-15T00:00:00.000Z';
const ok = (data: unknown): WireResponse => ({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: { code: 0, message: 'ok', data },
});
const denied = (code: number, status = 403): WireResponse => ({
  status,
  contentType: 'application/json',
  body: { code, message: '合成错误', data: null },
});
const tokens = (n = 1) => ({
  accessToken: 'SYNTHETIC_ACCESS_' + n,
  tokenType: 'Bearer',
  expiresIn: '15m',
  refreshToken: 'SYNTHETIC_REFRESH_' + n,
  refreshExpiresAt: '2099-01-01T00:00:00.000Z',
});
const profile = {
  userId: 'user-test',
  username: 'synthetic',
  memberId: 'member-test',
  memberNo: 'SYNTHETIC-01',
  realName: '合成身份',
  canUseApp: true,
  appAccessReason: null,
};
const caps = { account: { canUseApp: true }, managed: { canViewManagedActivities: false } };
const insurance = {
  id: 'insurance-test',
  insurerName: '合成保障',
  policyNumber: 'SYNTHETIC',
  coverageStart: null,
  coverageEnd: at,
  createdAt: at,
  reviewStatusCode: 'pending',
  version: 0,
  reviewedAt: null,
};
const receipt = {
  eventId: 'event-test',
  eventTypeCode: 'check_in',
  occurredAt: at,
  segmentStatusCode: 'open',
  serverTime: at,
  distanceMeters: '0.000',
  geoVerified: false,
  lowAccuracy: true,
  nextAllowedAction: 'check_out',
};
const metadata = {
  credentialId: 'credential-test',
  activityId: 'activity-test',
  sessionId: 'session-test',
  actionCode: 'check_in',
  credentialVersion: 1,
  statusCode: 'active',
  validFrom: at,
  validUntil: at,
  issuedAt: at,
  revokedAt: null,
};
const command = () => ({
  operationKey: 'operation-test',
  formVersion: 1,
  answers: [
    { fieldCode: 'number', value: 0 },
    { fieldCode: 'confirm', value: false },
  ],
  preferences: [{ sessionId: 'session-test', positionIds: ['position-test'] }],
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('NETWORK FORBIDDEN');
    }),
  );
});
describe('信封、运行时边界与媒体', () => {
  it('null 数据保留，缺 body/204/错类型不当成功', () => {
    expect(envelope(ok(null))).toBeNull();
    for (const response of [
      { status: 204, contentType: '', body: undefined },
      { status: 200, contentType: 'application/json', body: { code: 0, message: 'ok' } },
      { status: 500, contentType: 'application/json', body: { code: 0, message: 'ok', data: [] } },
    ])
      expect(() => envelope(response)).toThrow();
  });
  it('403 不变成退出，401按错误类别映射，未知码不猜刷新', () => {
    expect(() => envelope(denied(40300))).toThrow(expect.objectContaining({ kind: 'forbidden' }));
    expect(() => envelope(denied(10004, 401))).toThrow(
      expect.objectContaining({ kind: 'unauthenticated', message: '账号或密码错误' }),
    );
    expect(() => envelope(denied(77777, 401))).toThrow(
      expect.objectContaining({ kind: 'business-rejected' }),
    );
  });
  it('SVG二进制成功与JSON拒绝分流，禁止把JSON当图像', () => {
    expect(
      svg({
        status: 201,
        contentType: 'image/svg+xml;charset=utf-8',
        body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      }).type,
    ).toBe('image/svg+xml');
    expect(() => svg(denied(40300))).toThrow(expect.objectContaining({ kind: 'forbidden' }));
    expect(() => svg(ok({}))).toThrow();
  });
  it.each(['not-date', '2026-02-30T00:00:00Z', '2026-11-15', '2026-13-01T00:00:00Z'])(
    '拒绝时间 %s',
    (value) => expect(() => iso(value)).toThrow(),
  );
  it('Decimal 不经过浮点重算、分页缺字段失败', () => {
    expect(decimalString('123456789012345678.1200')).toBe('123456789012345678.1200');
    expect(() => decimalString(0)).toThrow();
    expect(() => page({ items: [], total: NaN, page: 1, pageSize: 20 }, (x) => x)).toThrow();
    expect(() => page({ items: [], total: 0, page: 1 }, (x) => x)).toThrow();
  });
  it('未知考勤动作不会默认为在岗，历史缺字段保持unknown', () => {
    const state = {
      isPresent: false,
      checkInAt: null,
      checkOutAllowedAt: null,
      distanceMeters: null,
      geoVerified: false,
      lowAccuracy: true,
      serverTime: at,
      nextAllowedAction: 'check_in',
    };
    expect(punchState(state).hasHistory).toBeNull();
    expect(() => punchState({ ...state, nextAllowedAction: 'future' })).toThrow();
  });
});
describe('身份契约', () => {
  it('退出后迟到登录不继续发送me和capabilities', async () => {
    let finish!: (response: WireResponse) => void;
    const t = new FakeTransport([() => new Promise<WireResponse>((resolve) => (finish = resolve))]);
    const store = new MemoryCredentialStore();
    const auth = new WireAuthCoordinator(t, store);
    const pending = auth.login('synthetic', 'password');
    await auth.logout();
    finish(ok(tokens()));
    await expect(pending).rejects.toHaveProperty('kind', 'cancelled');
    expect(t.requests).toHaveLength(1);
    expect(store.read()).toBeUndefined();
  });
  it.each([
    ['15m', 900000],
    ['1h', 3600000],
    ['2d', 172800000],
    ['1500ms', 1500],
  ])('时长 %s', (input, ms) => expect(duration(input)).toBe(ms));
  it.each(['2026-11-15T00:00:00Z', '0m', 'Infinity', '-1s', '1000y', '15', '1month'])(
    '错误时长 %s 必须拒绝',
    (input) => expect(() => duration(input)).toThrow(),
  );
  it('五字段凭证后独立读取 me/capabilities，资料未完成前无业务身份', async () => {
    const transport = new FakeTransport([ok(tokens()), ok(profile), ok(caps)]);
    const store = new MemoryCredentialStore();
    const auth = new WireAuthCoordinator(transport, store, () => 0);
    await auth.login(' synthetic ', ' ');
    expect(transport.requests.map((r) => r.path)).toEqual([
      '/api/auth/v1/login',
      '/api/app/v1/me',
      '/api/app/v1/me/capabilities',
    ]);
    expect(transport.requests[0]!.body).toEqual({ username: 'synthetic', password: ' ' });
    expect(transport.requests[1]!.headers).toEqual({ Authorization: 'Bearer SYNTHETIC_ACCESS_1' });
    expect(store.read()!.accessExpiresAt).toBe(900000);
  });
  it('me失败或成员不可用不创建可用凭证组', async () => {
    const store = new MemoryCredentialStore();
    const t = new FakeTransport([ok(tokens()), denied(40300)]);
    await expect(new WireAuthCoordinator(t, store).login('synthetic', 'p')).rejects.toHaveProperty(
      'kind',
      'forbidden',
    );
    expect(store.read()).toBeUndefined();
  });
  it('五个刷新共享一次，原子替换整组，绝对到期不变', async () => {
    const t = new FakeTransport([
      async () => {
        await Promise.resolve();
        return ok(tokens(2));
      },
    ]);
    const store = new MemoryCredentialStore();
    store.replace(credentials(tokens(), 0));
    const auth = new WireAuthCoordinator(t, store);
    await Promise.all(Array.from({ length: 5 }, () => auth.refresh()));
    expect(t.requests).toHaveLength(1);
    expect(store.read()!.refreshToken).toBe('SYNTHETIC_REFRESH_2');
    expect(store.read()!.accessToken).toBe('SYNTHETIC_ACCESS_2');
  });
  it('刷新响应可能丢失，旧refresh不自动再次使用', async () => {
    const t = new FakeTransport([new DeliveryError('unknown')]);
    const store = new MemoryCredentialStore();
    store.replace(credentials(tokens(), 0));
    const auth = new WireAuthCoordinator(t, store);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => auth.refresh()));
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    await expect(auth.refresh()).rejects.toHaveProperty('kind', 'unauthenticated');
    expect(t.requests).toHaveLength(1);
  });
  it('明确未发出保留凭证供受控重试，与响应丢失区分', async () => {
    const t = new FakeTransport([new DeliveryError('not-sent')]);
    const store = new MemoryCredentialStore();
    store.replace(credentials(tokens(), 0));
    await expect(new WireAuthCoordinator(t, store).refresh()).rejects.toHaveProperty(
      'kind',
      'network',
    );
    expect(store.read()).toBeDefined();
  });
  it('取消、明确拒绝结束全部等待者', async () => {
    for (const reply of [denied(10007, 401), ok(tokens(2))]) {
      const t = new FakeTransport([reply]);
      const store = new MemoryCredentialStore();
      store.replace(credentials(tokens(), 0));
      const auth = new WireAuthCoordinator(t, store);
      const controller = new AbortController();
      if (reply.status === 200) controller.abort();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => auth.refresh(controller.signal)),
      );
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(t.requests.length).toBeLessThanOrEqual(1);
    }
  });
  it('退出期间迟到刷新不恢复旧身份', async () => {
    let done!: (r: WireResponse) => void;
    const t = new FakeTransport([
      () => new Promise<WireResponse>((resolve) => (done = resolve)),
      ok(null),
    ]);
    const store = new MemoryCredentialStore();
    store.replace(credentials(tokens(), 0));
    const auth = new WireAuthCoordinator(t, store);
    const refresh = auth.refresh();
    await auth.logout();
    done(ok(tokens(2)));
    await expect(refresh).rejects.toHaveProperty('kind', 'cancelled');
    expect(store.read()).toBeUndefined();
  });
});
describe('请求白名单与逐操作恢复', () => {
  it('过滤UI字段、undefined分页；数组顺序、null表单版本保持', async () => {
    const t = new FakeTransport([ok({ items: [], total: 0, page: 2, pageSize: 20 })]);
    await createWire(t, () => 'SYNTHETIC').listActivities({
      q: '山 野',
      type: undefined,
      page: 2,
      pageSize: 20,
    });
    expect(t.requests[0]!.path).toBe(
      '/api/app/v1/activities?q=%E5%B1%B1+%E9%87%8E&page=2&pageSize=20',
    );
    const withUi = { ...command(), formVersion: null, uiOnly: 'DROP' };
    expect(registrationBody(withUi)).not.toHaveProperty('uiOnly');
    expect(registrationBody(command()).answers[0]).toEqual({ fieldCode: 'number', value: 0 });
  });
  it('报名仅接受一次性上传会话，不能把blob URL或File当附件ID', () => {
    expect(() =>
      registrationBody({ ...command(), answers: [{ fieldCode: 'file', value: 'blob:local' }] }),
    ).toThrow();
    expect(() =>
      registrationBody({
        ...command(),
        answers: [
          { fieldCode: 'file', value: new File(['x'], 'x.pdf', { type: 'application/pdf' }) },
        ],
      }),
    ).toThrow();
    expect(
      registrationBody({
        ...command(),
        answers: [{ fieldCode: 'file', uploadSessionId: 'session-upload' }],
      }).answers[0],
    ).toEqual({ fieldCode: 'file', uploadSessionId: 'session-upload' });
  });
  it('保险创建无key，更新/删除只有版本控制，冲突先刷新', async () => {
    const input = { insurer: '合成', policy: '合成', start: null, end: '2026-12-31' };
    expect(insuranceBody(input)).not.toHaveProperty('operationKey');
    expect(insuranceBody(input, 0)).toHaveProperty('expectedVersion', 0);
    expect(insuranceBody(input)).not.toHaveProperty('coverageStart');
    const t = new FakeTransport([ok(insurance), denied(26011, 409), ok(insurance)]);
    const wire = createWire(t, () => 'SYNTHETIC');
    await wire.createInsurance(input);
    await expect(wire.updateInsurance('insurance-test', input, 0)).rejects.toHaveProperty(
      'kind',
      'conflict',
    );
    await wire.deleteInsurance('insurance-test', 0);
    expect(t.requests.map((r) => r.retry)).toEqual(['none', 'version-only', 'version-only']);
    expect(t.requests[2]!.path).toContain('?expectedVersion=0');
  });
  it('无键创建回执丢失不自动新建操作，离线传输只执行一次', async () => {
    const t = new FakeTransport([new DeliveryError('unknown')]);
    await expect(
      createWire(t, () => 'SYNTHETIC').createInsurance({
        insurer: '合成',
        policy: '合成',
        start: null,
        end: '2026-12-31',
      }),
    ).rejects.toHaveProperty('kind', 'result-unknown');
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.body).not.toHaveProperty('operationKey');
  });
  it('同eventKey必须原凭证原位置，不能重新采样重放', async () => {
    const body = {
      activityId: 'activity-test',
      sessionId: 'session-test',
      key: 'event-key',
      action: 'check_in' as const,
      credential: 'SYNTHETIC_QR',
      location: { longitude: 0, latitude: 0, accuracy: 10 },
    };
    expect(punchBody(body)).toMatchObject({
      longitude: 0,
      latitude: 0,
      accuracy: 10,
      eventKey: 'event-key',
    });
    const registry = new IntentRegistry();
    const t = new FakeTransport([ok(receipt)]);
    const wire = createWire(t, () => 'SYNTHETIC');
    await registry.execute('event-key', body, () => wire.punch(body));
    await expect(
      registry.execute('event-key', { ...body, location: { ...body.location, latitude: 1 } }, () =>
        wire.punch(body),
      ),
    ).rejects.toHaveProperty('kind', 'conflict');
    expect(t.requests).toHaveLength(1);
  });
  it('二维码签发、状态、撤销、SVG render与成员码保持不同语义', async () => {
    const image: WireResponse = {
      status: 201,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    };
    const t = new FakeTransport([
      ok([metadata]),
      ok(metadata),
      ok({ ...metadata, statusCode: 'revoked' }),
      image,
      image,
    ]);
    const wire = createWire(t, () => 'SYNTHETIC');
    await wire.listQr('activity-test', 'session-test');
    await wire.issueQr('activity-test', 'session-test', 'check-in', 'op-1');
    await wire.revokeQr('activity-test', 'credential-test', 'op-2', '测试撤销');
    await wire.renderQr('activity-test', 'credential-test');
    await wire.renderMember();
    expect(t.requests.map((r) => r.accept)).toEqual([
      'application/json',
      'application/json',
      'application/json',
      'image/svg+xml',
      'image/svg+xml',
    ]);
    expect(t.requests[4]!.body).toBeUndefined();
  });
  it('附件 FormData 字段和一次性会话，响应丢失不重放', async () => {
    const t = new FakeTransport([
      ok({
        id: 'session-upload',
        token: 'SYNTHETIC_UPLOAD',
        expiresAt: '2099-01-01T00:00:00Z',
        formVersion: 1,
      }),
      ok({
        attachmentId: 'attachment-test',
        originalName: 'synthetic.pdf',
        mime: 'application/pdf',
        size: 1,
        createdAt: at,
      }),
    ]);
    const wire = createWire(t, () => 'SYNTHETIC');
    const session = await wire.createUploadSession('activity-test');
    await wire.upload(
      'activity-test',
      session.id,
      session.token,
      new File(['x'], 'synthetic.pdf', { type: 'application/pdf' }),
    );
    const body = t.requests[1]!.body as FormData;
    expect([...body.keys()]).toEqual(['token', 'file']);
    await expect(
      wire.upload(
        'activity-test',
        session.id,
        session.token,
        new File(['x'], 'synthetic.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toHaveProperty('kind', 'result-unknown');
    expect(t.requests).toHaveLength(2);
  });
});
