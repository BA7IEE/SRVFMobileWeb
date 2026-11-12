import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import OnsitePage from '../../src/features/managed/pages/OnsitePage.vue';
import PeoplePage from '../../src/features/managed/pages/PeoplePage.vue';
import ScannerPanel from '../../src/shared/components/ScannerPanel.vue';
import { fail } from '../../src/shared/errors';
import { cleanupDevices } from '../../src/shared/storage';

const api = vi.hoisted(() => ({
  getDetail: vi.fn(),
  overview: vi.fn(),
  qr: vi.fn(),
  proxy: vi.fn(),
  staffScan: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../../src/data', () => ({
  getData: () => ({
    activities: { getDetail: api.getDetail },
    managed: {
      getOnsiteOverview: api.overview,
      getQr: api.qr,
      proxyPunch: api.proxy,
      staffScan: api.staffScan,
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
  RouterLink: { template: '<a><slot /></a>' },
  CredentialPopup: true,
  ScannerPanel: true,
};
const sessions = [
  { id: 'first-session', name: '第一场' },
  { id: 'second-session', name: '第二场' },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.getDetail.mockResolvedValue({ title: '合成活动', sessions });
  api.overview.mockResolvedValue({
    total: 24,
    present: 8,
    people: [
      { identityId: 'person-a', label: 'DEMO-001 同名成员', present: false },
      { identityId: 'person-b', label: 'DEMO-002 同名成员', present: false },
    ],
  });
  api.qr.mockResolvedValue(null);
  api.confirm.mockResolvedValue(undefined);
  api.proxy.mockResolvedValue({ action: 'check_in', message: '已记录，待认定' });
});
describe('现场页异步与对象隔离', () => {
  it('初始场次来自活动，旧二维码晚到不能覆盖新动作', async () => {
    const old = deferred<null>();
    api.qr.mockReturnValueOnce(old.promise).mockResolvedValue(null);
    const wrapper = mount(OnsitePage, { global: { stubs } });
    await flushPromises();
    expect(api.overview).toHaveBeenCalledWith('activity-demo', 'first-session');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '签退码')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('此场次尚未生成签退码');
    old.reject(fail('service-unavailable', '旧签到码请求失败'));
    await flushPromises();
    expect(wrapper.text()).not.toContain('旧签到码请求失败');
    expect(wrapper.text()).toContain('此场次尚未生成签退码');
    wrapper.unmount();
  });
  it('二维码读取失败不冒充未生成，也不放行覆盖操作', async () => {
    api.qr.mockRejectedValue(fail('service-unavailable', '合成读取失败'));
    const wrapper = mount(OnsitePage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('考勤码读取失败');
    expect(wrapper.text()).not.toContain('此场次尚未生成');
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === '生成演示码')!
        .attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });
  it('后台时未确认的二维码写入不因清图片而允许换键重发', async () => {
    const write = deferred<null>();
    api.qr.mockImplementation((_id, _session, _action, operation) =>
      operation === 'read' ? Promise.resolve(null) : write.promise,
    );
    const wrapper = mount(OnsitePage, { global: { stubs } });
    await flushPromises();
    const issue = wrapper.findAll('button').find((b) => b.text() === '生成演示码')!;
    await issue.trigger('click');
    await flushPromises();
    expect(api.qr.mock.calls.filter((call) => call[3] === 'issue')).toHaveLength(1);
    cleanupDevices();
    write.resolve(null);
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '刷新二维码状态')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('操作结果尚未确认');
    expect(issue.attributes('disabled')).toBeDefined();
    await issue.trigger('click');
    expect(api.qr.mock.calls.filter((call) => call[3] === 'issue')).toHaveLength(1);
    wrapper.unmount();
  });
  it('代签确认锁住具体对象，离开页面后确认不会发起写操作', async () => {
    const confirmation = deferred<void>();
    api.confirm.mockReturnValue(confirmation.promise);
    const wrapper = mount(PeoplePage, { global: { stubs } });
    await flushPromises();
    const selects = wrapper.findAll('select');
    await selects[1]!.setValue('person-a');
    await wrapper.get('textarea').setValue('现场合成核验');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '核对并执行受控操作')!
      .trigger('click');
    expect(selects.every((s) => s.attributes('disabled') !== undefined)).toBe(true);
    expect(api.confirm.mock.calls[0]![0].message).toContain('person-a');
    wrapper.unmount();
    confirmation.resolve();
    await flushPromises();
    expect(api.proxy).not.toHaveBeenCalled();
  });
  it('搜索无匹配、当前页人数与总人数分开，切换动作清旧回执', async () => {
    const wrapper = mount(PeoplePage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('select')[1]!.setValue('person-a');
    await wrapper.get('textarea').setValue('合成现场核验');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '核对并执行受控操作')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('现场操作已记录');
    await wrapper.findAll('select')[2]!.setValue('check_out');
    expect(wrapper.text()).not.toContain('现场操作已记录');
    await wrapper.get('input[type="search"]').setValue('不存在的合成人员');
    expect(wrapper.text()).toContain('当前显示 0 人；本场次参与人数 24 人');
    expect(wrapper.text()).toContain('没有匹配的人员');
    expect((wrapper.findAll('select')[1]!.element as HTMLSelectElement).value).toBe('');
    wrapper.unmount();
  });
  it('代签结果未知时保留提示且不以新键重复写入', async () => {
    api.proxy.mockRejectedValue(fail('result-unknown', '回执未收到'));
    const wrapper = mount(PeoplePage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('select')[1]!.setValue('person-a');
    await wrapper.get('textarea').setValue('合成现场核验');
    const submit = wrapper.findAll('button').find((b) => b.text() === '核对并执行受控操作')!;
    await submit.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('操作结果尚未确认');
    expect(submit.attributes('disabled')).toBeDefined();
    await submit.trigger('click');
    expect(api.proxy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
describe('扫码视频生命周期', () => {
  it('视频播放失败也释放相机流', async () => {
    const trackStop = vi.fn();
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('播放失败'));
    const wrapper = mount(ScannerPanel, { props: { label: '扫描' } });
    await wrapper.findAll('button')[0]!.trigger('click');
    await flushPromises();
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法读取，请重试');
    expect(wrapper.text()).not.toContain('停止并关闭相机');
    wrapper.unmount();
  });
});
