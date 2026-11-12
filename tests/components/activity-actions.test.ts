import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ActivityDetailPage from '../../src/features/activities/pages/ActivityDetailPage.vue';

const api = vi.hoisted(() => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  auth: { epoch: 1, ready: true },
}));
vi.mock('../../src/data', () => ({
  getData: () => ({
    activities: {
      getDetail: async () => ({
        title: '合成活动',
        type: '演练',
        phase: 'open',
        registration: { state: 'allowed' },
        sessions: [],
      }),
      getMyParticipationContext: async () => ({
        status: 'submitted',
        canCancel: true,
        canEdit: true,
      }),
    },
    insurance: { getEligibilityForActivity: async () => ({ status: 'eligible' }) },
    registrations: { cancel: api.cancel },
  }),
}));
vi.mock('../../src/features/auth/store', () => ({ useAuth: () => api.auth }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { activityId: 'activity-demo' } }) }));
vi.mock('vant', async (original) => ({
  ...(await original<object>()),
  showConfirmDialog: api.confirm,
}));
const stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  InsuranceRequirementCard: true,
  RegistrationResult: true,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.auth.epoch = 1;
  api.auth.ready = true;
  api.cancel.mockResolvedValue(undefined);
});
describe('活动详情取消确认', () => {
  it('确认中锁定入口，离页后确认不再取消报名', async () => {
    const confirmation = deferred();
    api.confirm.mockReturnValue(confirmation.promise);
    const wrapper = mount(ActivityDetailPage, { global: { stubs } });
    await flushPromises();
    const cancel = wrapper.findAll('button').find((button) => button.text() === '取消报名')!;
    await cancel.trigger('click');
    expect(cancel.attributes('disabled')).toBeDefined();
    wrapper.unmount();
    confirmation.resolve();
    await flushPromises();
    expect(api.cancel).not.toHaveBeenCalled();
  });
  it('同页确认期间身份代次变化也不取消其他会话的报名', async () => {
    const confirmation = deferred();
    api.confirm.mockReturnValue(confirmation.promise);
    const wrapper = mount(ActivityDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '取消报名')!
      .trigger('click');
    api.auth.epoch++;
    confirmation.resolve();
    await flushPromises();
    expect(api.cancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
