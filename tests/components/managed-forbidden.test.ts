import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import OnsitePage from '../../src/features/managed/pages/OnsitePage.vue';
import PeoplePage from '../../src/features/managed/pages/PeoplePage.vue';
import ManagedRegistrationsPage from '../../src/features/managed/pages/ManagedRegistrationsPage.vue';
import { fail } from '../../src/shared/errors';

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  overview: vi.fn(),
  qr: vi.fn(),
  proxy: vi.fn(),
  scan: vi.fn(),
  registrations: vi.fn(),
  review: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../../src/data', () => ({
  getData: () => ({
    activities: { getDetail: api.detail },
    managed: {
      getOnsiteOverview: api.overview,
      getQr: api.qr,
      proxyPunch: api.proxy,
      staffScan: api.scan,
      listRegistrations: api.registrations,
      executeAllowedReview: api.review,
    },
  }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { activityId: 'activity-demo' }, query: {} }),
}));
vi.mock('vant', async (original) => ({
  ...(await original<object>()),
  showConfirmDialog: api.confirm,
}));
const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  CredentialPopup: {
    props: ['show', 'payload'],
    template: '<div v-if="show" data-credential>{{ payload }}</div>',
  },
  ScannerPanel: {
    emits: ['recognized'],
    template:
      "<button @click=\"$emit('recognized', 'synthetic-member-code')\">扫描合成成员码</button>",
  },
};
let wrapper: VueWrapper | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function button(text: string) {
  return wrapper!.findAll('button').find((x) => x.text() === text)!;
}
const overview = {
  total: 24,
  present: 8,
  people: [{ identityId: 'person-a', label: 'DEMO-001 合成成员', present: false }],
};
const credential = {
  id: 'synthetic-qr',
  version: 1,
  action: 'check_in',
  sessionId: 'session-a',
  status: 'active',
  payload: 'SYNTHETIC-CREDENTIAL',
  validUntil: '2026-11-15T12:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  api.detail.mockResolvedValue({
    title: '合成活动',
    sessions: [{ id: 'session-a', name: '上午场' }],
  });
  api.overview.mockResolvedValue(overview);
  api.qr.mockResolvedValue(credential);
  api.registrations.mockResolvedValue([
    {
      id: 'registration-a',
      memberLabel: 'DEMO-001 合成成员',
      status: 'pending',
      sessions: '上午场',
      review: { state: 'allowed' },
    },
  ]);
  api.confirm.mockResolvedValue(undefined);
  api.proxy.mockResolvedValue({ action: 'check_in', message: '合成旧成功回执' });
  api.scan.mockResolvedValue({ action: 'check_in', message: '合成旧成功回执' });
  api.review.mockResolvedValue([
    { id: 'registration-a', success: true, message: '合成旧审核回执' },
  ]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
async function deniedVisible() {
  await flushPromises();
  const alert = wrapper!
    .findAll('[role="alert"]')
    .find((x) => x.text().includes('当前活动的操作权限已失效'));
  expect(alert, '失权提示必须独立于业务data可见').toBeDefined();
  expect(alert!.isVisible()).toBe(true);
  expect(
    wrapper!
      .findAll('a')
      .some(
        (x) => x.text() === '返回我负责的活动' && x.attributes('href') === '/managed/activities',
      ),
  ).toBe(true);
  expect(button('重新读取权限与数据').isVisible()).toBe(true);
  expect(wrapper!.text()).not.toContain('DEMO-001 合成成员');
  expect(wrapper!.text()).not.toContain('合成旧成功回执');
  expect(wrapper!.text()).not.toContain('合成旧审核回执');
  expect(wrapper!.find('[data-credential]').exists()).toBe(false);
}
async function mountPeople() {
  wrapper = mount(PeoplePage, { global: { stubs } });
  await flushPromises();
  expect(wrapper.text()).toContain('DEMO-001 合成成员');
  await wrapper.findAll('select')[1]!.setValue('person-a');
  await wrapper.get('textarea').setValue('合成现场核验原因');
}
describe('F01 成功加载后的局部失权', () => {
  it('二维码局部读取forbidden后提示/返回可见，旧并发概览不能恢复，恢复只读不重放', async () => {
    wrapper = mount(OnsitePage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('本场次参与人数');
    await button('展示当前签到码').trigger('click');
    expect(wrapper.get('[data-credential]').text()).toBe('SYNTHETIC-CREDENTIAL');
    const oldOverview = deferred<typeof overview>();
    const deniedQr = deferred<typeof credential>();
    api.overview.mockReturnValueOnce(oldOverview.promise);
    api.qr.mockReturnValueOnce(deniedQr.promise);
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    deniedQr.reject(fail('forbidden', '合成职责已撤销'));
    await deniedVisible();
    oldOverview.resolve(overview);
    await deniedVisible();
    const reads = api.overview.mock.calls.length;
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    expect(api.overview).toHaveBeenCalledTimes(reads);
    await deniedVisible();
    await button('重新读取权限与数据').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('本场次参与人数');
    expect(wrapper.text()).not.toContain('当前活动的操作权限已失效');
    expect(api.qr.mock.calls.every((call) => call[3] === 'read')).toBe(true);
  });
  it('概览读取失权后，旧二维码写入成功不能重开码图，失败重读仍保留提示', async () => {
    wrapper = mount(OnsitePage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('有效演示码');
    const oldWrite = deferred<typeof credential>();
    api.qr.mockImplementation((_id, _session, _action, operation) =>
      operation === 'read' ? Promise.resolve(credential) : oldWrite.promise,
    );
    await button('重签演示码').trigger('click');
    await flushPromises();
    api.overview.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
    window.dispatchEvent(new Event('srvf:resume'));
    await deniedVisible();
    const reads = api.overview.mock.calls.length;
    oldWrite.resolve(credential);
    await deniedVisible();
    expect(api.overview).toHaveBeenCalledTimes(reads);
    api.overview.mockRejectedValueOnce(fail('network', '合成重读失败'));
    await button('重新读取权限与数据').trigger('click');
    await deniedVisible();
    expect(button('重新读取权限与数据').attributes('disabled')).toBeUndefined();
    expect(api.qr.mock.calls.filter((call) => call[3] !== 'read')).toHaveLength(1);
  });
  it.each(['issue', 'revoke'])(
    '二维码%s写入forbidden后有独立反馈，重读不会重复写',
    async (operation) => {
      wrapper = mount(OnsitePage, { global: { stubs } });
      await flushPromises();
      expect(wrapper.text()).toContain('有效演示码');
      api.qr.mockImplementation((_id, _session, _action, op) =>
        op === 'read'
          ? Promise.resolve(credential)
          : Promise.reject(fail('forbidden', '合成职责已撤销')),
      );
      await button(operation === 'issue' ? '重签演示码' : '撤销当前码').trigger('click');
      await deniedVisible();
      await button('重新读取权限与数据').trigger('click');
      await flushPromises();
      expect(api.qr.mock.calls.filter((call) => call[3] !== 'read')).toHaveLength(1);
      expect(wrapper.text()).toContain('有效演示码');
    },
  );
  it.each(['proxy', 'scan'])(
    '人员%s写入forbidden后清理输入/回执，提示和返回可见且重读不重放',
    async (method) => {
      await mountPeople();
      await button('核对并执行受控操作').trigger('click');
      await flushPromises();
      expect(wrapper!.text()).toContain('合成旧成功回执');
      api[method as 'proxy' | 'scan'].mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
      await wrapper!.get('textarea').setValue('只属于旧操作的原因');
      await button(method === 'proxy' ? '核对并执行受控操作' : '扫描合成成员码').trigger('click');
      await deniedVisible();
      const writes = api.proxy.mock.calls.length + api.scan.mock.calls.length;
      await button('重新读取权限与数据').trigger('click');
      await flushPromises();
      expect(api.proxy.mock.calls.length + api.scan.mock.calls.length).toBe(writes);
      expect((wrapper!.findAll('select')[1]!.element as HTMLSelectElement).value).toBe('');
      expect((wrapper!.get('textarea').element as HTMLTextAreaElement).value).toBe('');
    },
  );
  it('名单读取forbidden作废旧在途代签成功，旧回执不能恢复名单或触发重读', async () => {
    await mountPeople();
    const oldWrite = deferred<{ action: string; message: string }>();
    api.proxy.mockReturnValueOnce(oldWrite.promise);
    await button('核对并执行受控操作').trigger('click');
    await flushPromises();
    api.overview.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
    window.dispatchEvent(new Event('srvf:resume'));
    await deniedVisible();
    const reads = api.overview.mock.calls.length;
    oldWrite.resolve({ action: 'check_in', message: '合成旧成功回执' });
    await deniedVisible();
    expect(api.overview).toHaveBeenCalledTimes(reads);
  });
  it('失权后显式恢复并开始新代签，旧写收尾不能解锁新操作', async () => {
    await mountPeople();
    const oldWrite = deferred<{ action: string; message: string }>();
    const newWrite = deferred<{ action: string; message: string }>();
    api.proxy.mockReturnValueOnce(oldWrite.promise).mockReturnValueOnce(newWrite.promise);
    await button('核对并执行受控操作').trigger('click');
    await flushPromises();
    api.overview.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
    window.dispatchEvent(new Event('srvf:resume'));
    await deniedVisible();
    await button('重新读取权限与数据').trigger('click');
    await flushPromises();
    await wrapper!.findAll('select')[1]!.setValue('person-a');
    await wrapper!.get('textarea').setValue('新操作的合成原因');
    const newSubmit = button('核对并执行受控操作');
    await newSubmit.trigger('click');
    await flushPromises();
    expect(newSubmit.attributes('disabled')).toBeDefined();
    oldWrite.resolve({ action: 'check_in', message: '合成旧成功回执' });
    await flushPromises();
    expect(newSubmit.attributes('disabled')).toBeDefined();
    expect(wrapper!.text()).not.toContain('合成旧成功回执');
    expect(api.proxy).toHaveBeenCalledTimes(2);
    newWrite.resolve({ action: 'check_in', message: '新操作已记录' });
    await flushPromises();
    expect(wrapper!.text()).toContain('新操作已记录');
  });
  it('报名审核forbidden不冒充空名单，提示/返回可见，恢复后无旧选择和旧结果', async () => {
    wrapper = mount(ManagedRegistrationsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('DEMO-001 合成成员');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    api.review.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
    await button('审核已选 1 人').trigger('click');
    await deniedVisible();
    expect(wrapper.text()).not.toContain('没有符合条件的报名记录');
    await button('重新读取权限与数据').trigger('click');
    await flushPromises();
    expect(button('审核已选 0 人').attributes('disabled')).toBeDefined();
    expect(api.review).toHaveBeenCalledTimes(1);
  });
  it('报名读取forbidden后晚到审核结果不能恢复结果和名单', async () => {
    wrapper = mount(ManagedRegistrationsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('DEMO-001 合成成员');
    const oldWrite = deferred<{ id: string; success: boolean; message: string }[]>();
    api.review.mockReturnValueOnce(oldWrite.promise);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button('审核已选 1 人').trigger('click');
    await flushPromises();
    api.registrations.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
    window.dispatchEvent(new Event('srvf:resume'));
    await deniedVisible();
    const reads = api.registrations.mock.calls.length;
    oldWrite.resolve([{ id: 'registration-a', success: true, message: '合成旧审核回执' }]);
    await deniedVisible();
    expect(api.registrations).toHaveBeenCalledTimes(reads);
  });
  it('确认中读取失权会关闭真实Vant弹窗，移除其中的旧人员资料', async () => {
    const vant = await vi.importActual<typeof import('vant')>('vant');
    api.confirm.mockImplementation(vant.showConfirmDialog);
    try {
      await mountPeople();
      await button('核对并执行受控操作').trigger('click');
      await flushPromises();
      expect(document.querySelector('.van-dialog__message')?.textContent).toContain(
        'DEMO-001 合成成员',
      );
      expect(document.querySelector('.van-dialog__message')?.textContent).toContain('person-a');
      api.overview.mockRejectedValueOnce(fail('forbidden', '合成职责已撤销'));
      window.dispatchEvent(new Event('srvf:resume'));
      await deniedVisible();
      await vi.waitFor(() => {
        expect(document.querySelector('.van-dialog__message')?.textContent ?? '').not.toContain(
          'person-a',
        );
      });
      expect(api.proxy).not.toHaveBeenCalled();
    } finally {
      vant.closeDialog();
      await flushPromises();
    }
  });
});
