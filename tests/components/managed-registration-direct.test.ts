// @vitest-environment-options {"url":"https://h5.example.test/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { RouterView } from 'vue-router';
import { createH5Ports } from '../../src/data/h5';
import { router } from '../../src/app/router';

const activity = 'activity-alpha';
const other = 'activity-bravo';
const target = '/managed/activities/' + activity + '/registrations';
const detailPath = '/api/app/v1/my/managed-activities/' + activity;
const rosterPath = detailPath + '/registrations';
const duty = {
  responsibilityType: 'collaborator',
  canManageRegistrations: true,
  canManageAttendance: false,
};
const requests: string[] = [];
let ports: ReturnType<typeof createH5Ports>;
let globallyManaged: boolean;
let scope: unknown;
let responseActivity: string;
let failure: number;
let rowActivity: string;
let wrapper: VueWrapper | undefined;

// Exercise the registered route, real H5 ports and wire decoders. Only identity and HTTP I/O are fixtures.
vi.mock('../../src/data', () => ({ getData: () => ports }));
vi.mock('../../src/features/auth/store', () => ({
  useAuth: () => ({
    state: 'ready',
    ready: true,
    member: { managed: globallyManaged },
    restoreSession: async () => {},
    ensureSession: async () => {},
  }),
}));

function reply(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ code: status === 200 ? 0 : status * 100, message: 'fixture', data }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
beforeEach(async () => {
  globallyManaged = true;
  scope = duty;
  responseActivity = rowActivity = activity;
  failure = 0;
  requests.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_: string, work: () => unknown) => work() },
  });
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const path = url.pathname;
    requests.push(init.method + ' ' + path + url.search);
    if (path === '/api/auth/v1/h5/refresh')
      return reply({ tokenType: 'Bearer', accessToken: 'synthetic', expiresIn: '15m' });
    if (init.method !== 'GET') throw Error('Unexpected write');
    if (path === '/api/app/v1/my/managed-activities/organization-options') return reply([]);
    if (path === '/api/app/v1/my/managed-activities')
      return reply({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            activityId: activity,
            title: '合成活动',
            relationship: 'collaborator',
            statusCode: 'published',
          },
        ],
      });
    if (path === detailPath)
      return failure
        ? reply(null, failure)
        : reply({
            activity: {
              id: responseActivity,
              title: '合成活动',
              statusCode: 'published',
              allocationModeCode: 'qualification_rank',
              location: '线下',
              startAt: '2099-05-01T01:00:00Z',
              endAt: '2099-05-01T02:00:00Z',
            },
            publishReview: { status: 'approved' },
            myResponsibility: scope,
          });
    if (path === rosterPath && url.search === '?page=1&pageSize=20')
      return reply({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            activityId: rowActivity,
            registrationId: 'registration-one',
            statusCode: 'pass',
            member: { label: '合成队员' },
          },
        ],
      });
    throw Error('Unexpected fixture request');
  });
  let marker = '';
  ports = createH5Ports(() => {}, {
    read: async () => marker,
    write: async (s) => {
      marker = s;
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

async function enter(path = target) {
  await router.push(path);
  wrapper = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return router.currentRoute.value.path;
}
const rosterReads = () => requests.filter((r) => r.startsWith('GET ' + rosterPath + '?'));

describe('报名管理直达', () => {
  it('有该场职责时直达并显示同场非空名单', async () => {
    expect(await enter()).toBe(target);
    expect(wrapper!.text()).toContain('合成队员');
    expect(wrapper!.text()).toContain('已通过');
    expect(rosterReads()).toHaveLength(1);
    expect(wrapper!.findAll('input[type=checkbox]')).toHaveLength(0);
  });
  it('普通成员不能以其他场职责回执进入', async () => {
    globallyManaged = false;
    expect(await enter()).toBe('/system/forbidden');
    expect(requests.some((r) => r.startsWith('GET ' + detailPath))).toBe(false);
  });
  it.each([null, { ...duty, canManageRegistrations: false }])(
    '无该场报名管理职责时拒绝 %j',
    async (noDuty) => {
      scope = noDuty;
      expect(await enter()).toBe('/system/forbidden');
      expect(rosterReads()).toHaveLength(0);
    },
  );
  it('收到其他活动的职责回执时不读名单', async () => {
    responseActivity = other;
    expect(await enter()).toBe('/system/unavailable');
    expect(requests).toContain('GET ' + detailPath);
    expect(rosterReads()).toHaveLength(0);
  });
  it('职责字段格式不合法时拒绝进入', async () => {
    scope = { ...duty, canManageRegistrations: 'true' };
    expect(await enter()).not.toBe(target);
    expect(requests).toContain('GET ' + detailPath);
    expect(rosterReads()).toHaveLength(0);
  });
  it.each([
    [403, '/system/forbidden'],
    [503, '/system/unavailable'],
  ])('职责 GET 失败 %i', async (status, route) => {
    failure = Number(status);
    expect(await enter()).toBe(route);
    expect(requests).toContain('GET ' + detailPath);
    expect(rosterReads()).toHaveLength(0);
  });
  it('混入其他活动报名时整份名单不展示', async () => {
    rowActivity = other;
    expect(await enter()).toBe(target);
    expect(rosterReads()).toHaveLength(1);
    expect(wrapper!.text()).not.toContain('合成队员');
    expect(wrapper!.get('[role=alert]').text()).toContain('报名不属于当前活动');
  });
  it('已开名单恢复读取时职责被撤回，清除原名单', async () => {
    expect(await enter()).toBe(target);
    expect(wrapper!.text()).toContain('合成队员');
    scope = null;
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    expect(wrapper!.get('[role=alert]').text()).toContain('当前活动的操作权限已失效');
    expect(wrapper!.text()).not.toContain('合成队员');
    expect(rosterReads()).toHaveLength(1);
  });
  it('在工作台选择同场后仍显示名单和录取状态', async () => {
    expect(await enter('/managed/work')).toBe('/managed/work');
    const choose = wrapper!.findAll('button').find((button) => button.text() === '合成活动');
    expect(choose).toBeDefined();
    await choose!.trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('报名名单');
    expect(wrapper!.text()).toContain('合成队员 · 已通过');
    expect(rosterReads()).toHaveLength(1);
  });
});
