import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ParticipationPage from '../../src/features/participation/pages/ParticipationPage.vue';
import type { ParticipationRecord } from '../../src/data/models';
import { fail } from '../../src/shared/errors';
const context = vi.hoisted(() => ({ getRecordDetail: vi.fn() }));
const record = (id: string): ParticipationRecord => ({
  id,
  title: '演示活动 ' + id,
  session: '上午场',
  status: 'pending',
  hours: null,
  points: null,
  historical: false,
});
vi.mock('../../src/data', () => ({
  getData: () => ({
    participation: {
      getSummary: async () => ({ hours: null, points: null, source: 'mock' }),
      listRecords: async () => [record('a'), record('b')],
      getRecordDetail: context.getRecordDetail,
    },
  }),
}));
beforeEach(() => {
  context.getRecordDetail.mockReset();
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it('记录说明读取失败可显式重试，不吞错误或显示成空记录', async () => {
  context.getRecordDetail
    .mockRejectedValueOnce(fail('network', '演示读取失败'))
    .mockResolvedValueOnce(record('a'));
  const w = mount(ParticipationPage);
  await flushPromises();
  await w
    .findAll('button')
    .find((x) => x.text() === '查看记录说明')!
    .trigger('click');
  await flushPromises();
  expect(w.get('#participation-detail [role="alert"]').text()).toContain('演示读取失败');
  await w.get('#participation-detail .van-button').trigger('click');
  await flushPromises();
  expect(w.get('#participation-detail').text()).toContain('没有结果不表示零小时');
  expect(context.getRecordDetail).toHaveBeenCalledTimes(2);
  w.unmount();
});
it('快速查看下一条、关闭或离页后，晚到的旧说明不覆盖当前记录', async () => {
  let resolveFirst!: (value: ParticipationRecord) => void;
  context.getRecordDetail
    .mockImplementationOnce(
      () =>
        new Promise<ParticipationRecord>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...record('b'), status: 'recognized' });
  const w = mount(ParticipationPage);
  await flushPromises();
  const buttons = w.findAll('button').filter((x) => x.text() === '查看记录说明');
  await buttons[0]!.trigger('click');
  await buttons[1]!.trigger('click');
  await flushPromises();
  resolveFirst(record('a'));
  await flushPromises();
  expect(w.get('#participation-detail').text()).toContain('演示活动 b');
  expect(w.get('#participation-detail').text()).toContain('当前为演示认定结果');
  await w.get('#participation-detail .text-button').trigger('click');
  expect(w.find('#participation-detail').exists()).toBe(false);
  w.unmount();
});
