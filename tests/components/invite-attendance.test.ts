// @vitest-environment-options {"url":"https://h5.example.test/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { RouterView } from 'vue-router';
import { router } from '../../src/app/router';
import { createH5Ports } from '../../src/data/h5';

const activityId = 'activity-invite';
const sessionId = 'session-invite';
const title = '合成邀请活动';
const at = '2099-05-01T01:00:00Z';
const detailPath = '/api/app/v1/activities/' + activityId;
const punchPath = detailPath + '/sessions/' + sessionId + '/my-punch-state';
const attendanceRoute = '/activities/' + activityId + '/sessions/' + sessionId + '/attendance';
const dutiesPath = '/api/app/v1/my/managed-activities/' + activityId;
const requests: string[] = [];
let ports: ReturnType<typeof createH5Ports>;
let wrapper: VueWrapper | undefined;
let registration: 'pass' | 'cancelled' | null;
let duty: boolean;
let hasPunchState: boolean;
let detailStatus: number;

vi.mock('../../src/data', () => ({ getData: () => ports }));
vi.mock('../../src/features/auth/store', () => ({
  useAuth: () => ({
    state: 'ready',
    ready: true,
    restoreSession: async () => {},
    ensureSession: async () => {},
  }),
}));

function reply(data: unknown, status = 200, code = 0, message = 'fixture') {
  return new Response(JSON.stringify({ code, message, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(async () => {
  registration = null;
  duty = hasPunchState = false;
  detailStatus = 404;
  requests.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_: string, work: () => unknown) => work() },
  });
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const path = url.pathname;
    if (path === '/api/auth/v1/h5/refresh')
      return reply({ tokenType: 'Bearer', accessToken: 'synthetic', expiresIn: '15m' });
    if (init.method !== 'GET') throw Error('Unexpected write');
    requests.push(path);
    if (path === '/api/app/v1/activities')
      return reply({ items: [], page: 1, pageSize: 20, total: 0 });
    if (path === detailPath) return reply(null, detailStatus, 20001, '活动不存在');
    if (path === detailPath + '/registration-insurance') return reply(null, 404, 40400);
    if (path === punchPath)
      return hasPunchState
        ? reply({
            isPresent: true,
            checkInAt: at,
            checkOutAllowedAt: at,
            distanceMeters: null,
            geoVerified: false,
            lowAccuracy: false,
            serverTime: at,
            nextAllowedAction: 'check_out',
          })
        : reply(null, 400, 22076);
    if (path === '/api/app/v1/my/registrations') {
      const items = registration
        ? [
            {
              id: 'registration-one',
              activityId,
              statusCode: registration,
              waitlistPosition: null,
              registeredAt: at,
              cancelledAt: registration === 'cancelled' ? at : null,
              activityTitle: title,
              activityStartAt: at,
              activityEndAt: at,
            },
          ]
        : [];
      return reply({ items, page: 1, pageSize: 20, total: items.length });
    }
    if (path === dutiesPath)
      return duty
        ? reply({
            activity: { id: activityId, title },
            myResponsibility: {
              responsibilityType: 'collaborator',
              canManageRegistrations: false,
              canManageAttendance: true,
            },
          })
        : reply(null, 404, 20001, '活动不存在');
    throw Error('Unexpected fixture request');
  });
  let marker = '';
  ports = createH5Ports(() => {}, {
    read: async () => marker,
    write: async (next) => {
      marker = next;
    },
    onChange: () => {},
  });
  await ports.auth.restoreSession();
  await router.push('/privacy');
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
});

async function enter(path: string) {
  wrapper?.unmount();
  await router.push(path);
  wrapper = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('邀请活动的考勤直达', () => {
  it('无邀请、通过报名或职责时，目录和公开详情仍隐藏活动，考勤仍不可用', async () => {
    await expect(
      ports.activities.list({ keyword: '', type: '', available: false, page: 1 }),
    ).resolves.toMatchObject({ items: [] });
    await expect(ports.activities.getDetail(activityId)).rejects.toHaveProperty(
      'kind',
      'not-found',
    );
    const detail = await enter('/activities/' + activityId);
    expect(detail.get('[role=alert]').text()).toContain('活动不存在');
    expect(detail.text()).not.toContain(title);
    expect(requests).not.toContain(punchPath);

    const attendance = await enter(attendanceRoute);
    expect(requests).toContain(punchPath);
    expect(attendance.find('[role=alert]').exists()).toBe(true);
    expect(attendance.text()).not.toContain('当前在场');
  });

  it.each(['pass', 'duty'] as const)('详情隐藏时凭 %s 和本场打卡状态打开考勤', async (access) => {
    hasPunchState = true;
    registration = access === 'pass' ? 'pass' : null;
    duty = access === 'duty';
    const attendance = await enter(attendanceRoute);
    expect(requests).toContain(punchPath);
    expect(requests.includes(dutiesPath)).toBe(duty);
    expect(attendance.text()).toContain(title);
    expect(attendance.text()).toContain('当前在场');
    expect(attendance.text()).toContain('场次名称暂不可读');
    expect(attendance.text()).toContain('定位策略待确认');
    expect(attendance.text()).not.toContain('获取本次定位');
    await expect(ports.activities.getDetail(activityId)).rejects.toHaveProperty(
      'kind',
      'not-found',
    );
  });

  it('仅有历史参与身份、本人报名已取消且无职责时仍不打开', async () => {
    registration = 'cancelled';
    hasPunchState = true;
    const attendance = await enter(attendanceRoute);
    expect(requests).toContain(punchPath);
    expect(attendance.get('[role=alert]').text()).toContain('活动不存在');
    expect(attendance.text()).not.toContain(title);
  });

  it('错误信封与 HTTP 状态不匹配时不进入考勤回退路径', async () => {
    detailStatus = 503;
    registration = 'pass';
    hasPunchState = true;
    const attendance = await enter(attendanceRoute);
    expect(attendance.find('[role=alert]').exists()).toBe(true);
    expect(requests).not.toContain(punchPath);
  });
});
