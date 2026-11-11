import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicQuestions from '../../src/shared/components/DynamicQuestions.vue';
import InsuranceRequirementCard from '../../src/shared/components/InsuranceRequirementCard.vue';
import PageState from '../../src/shared/components/PageState.vue';
import FilePicker from '../../src/shared/components/FilePicker.vue';
import ScannerPanel from '../../src/shared/components/ScannerPanel.vue';
import { CameraAdapter } from '../../src/platform/camera';
import { questions } from '../../src/data/mock/fixtures';
import { fail } from '../../src/shared/errors';
describe('可观察组件行为', () => {
  it('模拟设备拒绝不调用真实相机，仍显示处理指引', async () => {
    const camera = vi.spyOn(CameraAdapter.prototype, 'start');
    const w = mount(ScannerPanel, { props: { label: '扫描', simulation: 'denied' } });
    await w.get('button').trigger('click');
    expect(camera).not.toHaveBeenCalled();
    expect(w.text()).toContain('模拟相机权限被拒绝');
    w.unmount();
  });
  it('八题全部渲染，零输入、明确确认与题目错误可见', async () => {
    const wrapper = mount(DynamicQuestions, {
      props: { questions, modelValue: {}, errors: { equipment: '请输入有效数字' } },
    });
    expect(wrapper.findAll('[data-question]')).toHaveLength(8);
    expect(wrapper.get('[role="alert"]').text()).toContain('有效数字');
    await wrapper.get('#q-equipment').setValue('0');
    expect(wrapper.emitted('update:modelValue')![0]![0]).toEqual({ equipment: '0' });
    expect((wrapper.get('#q-confirmed').element as HTMLInputElement).checked).toBe(false);
    wrapper.unmount();
  });
  it('未知题不能默默省略', () => {
    const wrapper = mount(DynamicQuestions, {
      props: {
        questions: [{ code: 'unsupported', label: '新题', required: true, type: 'unsupported' }],
        modelValue: {},
        errors: {},
      },
    });
    expect(wrapper.text()).toContain('无法提交');
    wrapper.unmount();
  });
  it('保险未知不是无保险，只有明确 eligible 呈现满足', () => {
    const wrapper = mount(InsuranceRequirementCard, {
      props: {
        activityId: 'act-open',
        eligibility: {
          activityId: 'act-open',
          required: true,
          status: 'unknown',
          explanation: '暂无法确认',
          checkedAt: '2026-11-15T00:00:00Z',
        },
      },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    expect(wrapper.text()).toContain('待确认');
    expect(wrapper.text()).not.toContain('满足演示条件');
    wrapper.unmount();
  });
  it('未知结果提示查询原结果，空态与错误分开', () => {
    const wrapper = mount(PageState, { props: { error: fail('result-unknown', '结果丢失') } });
    expect(wrapper.text()).toContain('查询原结果');
    expect(wrapper.text()).not.toContain('暂无记录');
    wrapper.unmount();
  });
  it('文件重选与卸载释放对象 URL', async () => {
    const create = vi.fn(() => 'blob:local');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const wrapper = mount(FilePicker, {
      props: { id: 'file', modelValue: new File(['data'], 'a.png', { type: 'image/png' }) },
    });
    expect(create).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ modelValue: undefined });
    expect(revoke).toHaveBeenCalledWith('blob:local');
    wrapper.unmount();
  });
});
