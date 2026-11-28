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
type ListItem = ReturnType<typeof item>;
function item(
  id = activity,
  title = '合成资格场',
  relationship = 'collaborator',
  statusCode = 'published',
) {
  return {
    activityId: id,
    title,
    relationship,
    statusCode,
    startAt: '2099-01-01T00:00:00Z',
    endAt: '2099-01-02T00:00:00Z',
    pendingRegistrations: 0,
  };
}
const listPath = '/api/app/v1/my/managed-activities';
let rows: ListItem[];
let listFailure: number;
let returnedPage: number | undefined;
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
  rows = [item()];
  listFailure = 0;
  returnedPage = undefined;
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
    if (path === listPath) {
      if (listFailure) return reply(null, listFailure);
      const p = Number(url.searchParams.get('page'));
      if (url.searchParams.get('pageSize') !== '20') throw Error('Unexpected pagination');
      return reply({
        page: returnedPage ?? p,
        pageSize: 20,
        total: rows.length,
        items: rows.slice((p - 1) * 20, p * 20),
      });
    }
    if (path === detailPath)
      return failure
        ? reply(null, failure)
        : reply({
            activity: {
              id: responseActivity,
              title: '合成资格场',
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

async function enter(path = '/managed/activities') {
  await router.push(path);
  wrapper = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return router.currentRoute.value.path;
}

const link = () => wrapper!.find('a[href$="/registrations"]');
describe('独立负责列表与报名管理入口', () => {
  it('显示同场职责、状态与链接，从实际链接进入非空只读名单', async () => {
    await enter();
    expect(wrapper!.text()).toContain('合成资格场');
    expect(wrapper!.text()).toContain('协作者');
    expect(wrapper!.text()).toContain('已发布');
    expect(link().attributes('href')).toBe('#' + target);
    await link().trigger('click');
    await flushPromises();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(target));
    await vi.waitFor(() => expect(wrapper!.text()).toContain('合成队员'));
    expect(wrapper!.text()).toContain('已通过');
    expect(requests.filter((r) => r.startsWith('GET ' + rosterPath))).toHaveLength(1);
  });
  it('按真实页码读取下一页，单纯发起人不显示报名管理链接', async () => {
    rows = Array.from({ length: 20 }, (_, i) =>
      item('fixture-draft-' + i, '合成草稿' + i, 'initiator', 'draft'),
    ).concat(item());
    await enter();
    expect(wrapper!.findAll('section.panel h2')).toHaveLength(20);
    expect(wrapper!.text()).toContain('发起人');
    expect(wrapper!.text()).toContain('草稿');
    expect(link().exists()).toBe(false);
    await wrapper!.get('button[aria-label="下一页"]').trigger('click');
    await flushPromises();
    expect(requests).toContain('GET ' + listPath + '?page=2&pageSize=20');
    expect(wrapper!.text()).toContain('合成资格场');
    expect(wrapper!.text()).not.toContain('合成草稿0');
    expect(link().attributes('href')).toBe('#' + target);
    await wrapper!.get('button[aria-label="上一页"]').trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('合成草稿0');
  });
  it('普通成员在列表入口被守卫拒绝，不请求列表', async () => {
    globallyManaged = false;
    expect(await enter()).toBe('/system/forbidden');
    expect(requests.some((r) => r.includes(listPath))).toBe(false);
  });
  it('列表关系不能代替该场报名权限', async () => {
    scope = { ...duty, canManageRegistrations: false };
    await enter();
    expect(wrapper!.text()).toContain('合成资格场');
    expect(link().exists()).toBe(false);
  });
  it('详情返回另一活动时，不显示错误活动或链接', async () => {
    responseActivity = other;
    await enter();
    expect(wrapper!.get('[role=alert]').text()).toContain('活动回执不一致');
    expect(link().exists()).toBe(false);
  });
  it('列表读取后撤权，恢复页面会清除旧链接', async () => {
    await enter();
    expect(link().exists()).toBe(true);
    scope = null;
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    expect(link().exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('合成资格场');
  });
  it('点击旧链接时重新核当前场职责', async () => {
    await enter();
    expect(link().exists()).toBe(true);
    scope = null;
    await link().trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/system/forbidden');
    expect(requests.some((r) => r.startsWith('GET ' + rosterPath))).toBe(false);
  });
  it.each([403, 503])('列表返回 %i 时显示错误、无入口', async (code) => {
    listFailure = code;
    await enter();
    expect(requests).toContain('GET ' + listPath + '?page=1&pageSize=20');
    expect(wrapper!.find('[role=alert]').exists()).toBe(true);
    expect(link().exists()).toBe(false);
  });
  it('错页不能冒作本页', async () => {
    returnedPage = 2;
    await enter();
    expect(wrapper!.get('[role=alert]').text()).toContain('分页');
    expect(link().exists()).toBe(false);
  });
});
