import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AccountPage from '../../src/features/account/pages/AccountPage.vue';
import { cleanupDevices, cleanupSession } from '../../src/shared/storage';
import { fail } from '../../src/shared/errors';
const context = vi.hoisted(() => ({ getMemberCredential: vi.fn() }));
vi.mock('../../src/data', () => ({
  getData: () => ({ attendance: { getMemberCredential: context.getMemberCredential } }),
}));
vi.mock('../../src/features/auth/store', () => ({
  useAuth: () => ({ member: { name: '演示队员' } }),
}));
vi.mock('../../src/app/router', () => ({ router: { replace: vi.fn() } }));
beforeEach(() => context.getMemberCredential.mockReset());
afterEach(() => vi.restoreAllMocks());
const options = {
  global: {
    stubs: {
      RouterLink: { template: '<a><slot /></a>' },
      CredentialPopup: {
        props: ['show', 'payload'],
        template: '<div v-if="show" data-code>{{ payload }}</div>',
      },
    },
  },
};
it('成员码读取失败有可重试反馈，并阻止连续点击', async () => {
  context.getMemberCredential
    .mockRejectedValueOnce(fail('network', '演示读取失败'))
    .mockResolvedValueOnce('synthetic-member');
  const w = mount(AccountPage, options);
  const button = w.findAll('button').find((x) => x.text() === '本人成员码')!;
  await button.trigger('click');
  await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('演示读取失败');
  await button.trigger('click');
  await flushPromises();
  expect(w.get('[data-code]').text()).toBe('synthetic-member');
  expect(context.getMemberCredential).toHaveBeenCalledTimes(2);
  w.unmount();
});
it.each([cleanupDevices, cleanupSession])(
  '切后台或清会话后，晚到成员码不重新打开',
  async (cleanup) => {
    let resolve!: (value: string) => void;
    context.getMemberCredential.mockImplementation(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const w = mount(AccountPage, options);
    const button = w.findAll('button').find((x) => x.text() === '本人成员码')!;
    await button.trigger('click');
    await button.trigger('click');
    expect(context.getMemberCredential).toHaveBeenCalledTimes(1);
    cleanup();
    resolve('old-synthetic-member');
    await flushPromises();
    expect(w.find('[data-code]').exists()).toBe(false);
    w.unmount();
  },
);
