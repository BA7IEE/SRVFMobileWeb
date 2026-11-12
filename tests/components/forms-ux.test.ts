import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { showConfirmDialog } from 'vant';
import RegisterPage from '../../src/features/registrations/pages/RegisterPage.vue';
import InsurancePage from '../../src/features/insurance/pages/InsurancePage.vue';
import DynamicQuestions from '../../src/shared/components/DynamicQuestions.vue';
import { fail } from '../../src/shared/errors';
import type { SelfInsurance } from '../../src/data/models';

const port = vi.hoisted(() => ({
  getMyOverview: vi.fn(),
  updateSelf: vi.fn(),
  createSelf: vi.fn(),
  deleteSelf: vi.fn(),
  getEligibilityForActivity: vi.fn(),
}));
const registration = vi.hoisted(() => ({ getForm: vi.fn(), getResult: vi.fn(), submit: vi.fn() }));
const activity = vi.hoisted(() => ({ getDetail: vi.fn() }));
vi.mock('../../src/data', () => ({
  getData: () => ({ insurance: port, registrations: registration, activities: activity }),
}));
vi.mock('../../src/features/auth/store', () => ({
  useAuth: () => ({ ready: true, member: { id: 'synthetic-member' } }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: { activityId: 'synthetic-activity' } }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock('vant', async (load) => ({
  ...(await load<typeof import('vant')>()),
  showConfirmDialog: vi.fn().mockResolvedValue(undefined),
}));

let wrapper: VueWrapper | undefined;
const record: SelfInsurance = {
  id: 'synthetic-policy',
  insurer: '合成公司',
  policy: 'SYNTHETIC-ONLY',
  start: null,
  end: '2026-12-31',
  review: 'verified',
  version: 1,
};
function overview(version = 1) {
  return { self: [{ ...record, version }], team: [] };
}
async function openEditor() {
  wrapper = mount(InsurancePage, {
    attachTo: document.body,
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  });
  await flushPromises();
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '修改资料')!
    .trigger('click');
  await flushPromises();
}
async function submit() {
  await wrapper!.get('form').trigger('submit');
  await flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks();
  port.getMyOverview.mockResolvedValue(overview());
  port.getEligibilityForActivity.mockResolvedValue({
    status: 'eligible',
    explanation: '合成条件满足',
  });
  activity.getDetail.mockResolvedValue({ title: '合成活动', registration: { state: 'allowed' } });
  registration.getResult.mockResolvedValue(undefined);
  registration.getForm.mockResolvedValue({
    version: 1,
    qualification: { result: 'pass', unmetRules: [] },
    questions: [{ code: 'contact', label: '合成称呼', type: 'short_text', required: true }],
    sessions: [
      {
        id: 'synthetic-session',
        name: '合成场次',
        startAt: '2026-11-21T01:00:00Z',
        endAt: '2026-11-21T04:00:00Z',
        positions: [],
        qualification: { result: 'pass', unmetRules: [] },
      },
    ],
  });
  port.updateSelf.mockResolvedValue({ ...record, review: 'pending', version: 2 });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('保险编辑与错误定位', () => {
  it('删除确认等待期间离页，晚到确认不能再发送保险删除', async () => {
    let confirm!: (value: 'confirm') => void;
    vi.mocked(showConfirmDialog).mockImplementationOnce(
      () => new Promise<'confirm'>((resolve) => (confirm = resolve)),
    );
    wrapper = mount(InsurancePage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '删除登记')!
      .trigger('click');
    await flushPromises();
    expect(showConfirmDialog).toHaveBeenCalled();
    wrapper.unmount();
    wrapper = undefined;
    confirm('confirm');
    await flushPromises();
    expect(port.deleteSelf).not.toHaveBeenCalled();
  });

  it('打开编辑定位到公司，提交首错聚焦且关联错误，不清空其他输入', async () => {
    await openEditor();
    expect(document.activeElement?.id).toBe('insurance-insurer');
    await wrapper!.get('#insurance-insurer').setValue('');
    await wrapper!.get('#insurance-policy').setValue('SYNTHETIC-INPUT-KEPT');
    await submit();
    expect(port.updateSelf).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('insurance-insurer');
    expect(wrapper!.get('#insurance-insurer').attributes('aria-describedby')).toBe(
      'insurance-error-insurer',
    );
    expect((wrapper!.get('#insurance-policy').element as HTMLInputElement).value).toBe(
      'SYNTHETIC-INPUT-KEPT',
    );
  });

  it('冲突刷新失败后继续锁住保存，成功核对当前版本后才允许更新', async () => {
    await openEditor();
    port.updateSelf.mockRejectedValueOnce(fail('conflict', '资料已发生变化，请刷新后核对'));
    await wrapper!.get('#insurance-insurer').setValue('合成新公司');
    await submit();
    const refresh = () =>
      wrapper!.findAll('button').find((b) => b.text() === '刷新当前资料并核对')!;
    port.getMyOverview.mockRejectedValueOnce(fail('network', '合成读取失败'));
    await refresh().trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('合成读取失败');
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === '重新读取')!
      .trigger('click');
    await flushPromises();
    expect(wrapper!.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect((wrapper!.get('#insurance-insurer').element as HTMLInputElement).value).toBe(
      '合成新公司',
    );
    port.getMyOverview.mockResolvedValueOnce(overview(2));
    await refresh().trigger('click');
    await flushPromises();
    expect(wrapper!.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
    port.updateSelf.mockResolvedValueOnce({ ...record, version: 3 });
    await submit();
    expect(port.updateSelf).toHaveBeenLastCalledWith(
      record.id,
      expect.objectContaining({ insurer: '合成新公司' }),
      2,
    );
  });

  it('服务端字段错误只映射已知保险字段并聚焦，保留原输入', async () => {
    await openEditor();
    const error = fail('validation', '合成字段校验失败');
    error.fieldErrors = { policy: '合成保单格式待核对', unexpected: '不应关联页面字段' };
    port.updateSelf.mockRejectedValueOnce(error);
    await submit();
    expect(document.activeElement?.id).toBe('insurance-policy');
    expect(wrapper!.get('#insurance-error-policy').text()).toBe('合成保单格式待核对');
    expect(wrapper!.text()).not.toContain('不应关联页面字段');
    expect((wrapper!.get('#insurance-policy').element as HTMLInputElement).value).toBe(
      record.policy,
    );
  });

  it('保存期间不能切换登记或关闭编辑，避免旧保存覆盖新编辑', async () => {
    await openEditor();
    let finish!: (value: SelfInsurance) => void;
    port.updateSelf.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await submit();
    for (const text of ['新增登记', '修改资料', '关闭']) {
      expect(
        wrapper!
          .findAll('button')
          .find((b) => b.text() === text)!
          .attributes('disabled'),
      ).toBeDefined();
    }
    finish(record);
    await flushPromises();
    expect(wrapper!.find('form').exists()).toBe(false);
  });
});

describe('动态题错误语义', () => {
  it('校验通过不插入空错误块，避免失焦时提交按钮跳位', () => {
    wrapper = mount(DynamicQuestions, {
      props: {
        questions: [{ code: 'confirmed', label: '合成确认', type: 'confirmation', required: true }],
        modelValue: { confirmed: true },
        errors: { confirmed: '' },
      },
    });
    expect(wrapper.find('.field-error').exists()).toBe(false);
  });

  it('选择、确认和附件均关联对应题目及错误，必填可选用文字说明', () => {
    wrapper = mount(DynamicQuestions, {
      props: {
        questions: [
          {
            code: 'single',
            label: '到场方式',
            type: 'single_choice',
            required: true,
            options: ['自行'],
          },
          {
            code: 'multi',
            label: '协作事项',
            type: 'multi_choice',
            required: false,
            options: ['后勤'],
          },
          { code: 'confirm', label: '知悉要求', type: 'confirmation', required: true },
          { code: 'file', label: '本地附件', type: 'file', required: true },
        ],
        modelValue: {},
        errors: { single: '请选择', multi: '请核对', confirm: '请确认', file: '请选择文件' },
      },
    });
    for (const code of ['single', 'multi', 'confirm']) {
      expect(wrapper.get('#q-' + code).attributes('aria-invalid')).toBe('true');
      expect(wrapper.get('#q-' + code).attributes('aria-describedby')).toBe('err-' + code);
    }
    expect(wrapper.get('#q-file-choose').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#q-file-choose').attributes('aria-describedby')).toContain('err-file');
    expect(wrapper.get('#label-multi').text()).toContain('可选');
    expect(wrapper.get('#label-confirm').text()).toContain('必填');
  });
});

describe('报名读取与服务端字段错误', () => {
  it('改正已报错题立即更新该题错误，保留未修改题目的服务端错误', async () => {
    const definition = await registration.getForm();
    registration.getForm.mockResolvedValueOnce({
      ...definition,
      questions: [
        ...definition.questions,
        {
          code: 'travel',
          label: '合成到场方式',
          type: 'single_choice',
          required: true,
          options: ['自行到场', '统一集合'],
        },
      ],
    });
    wrapper = mount(RegisterPage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    await wrapper.get('#q-contact').setValue('合成称呼');
    await wrapper.get('#q-travel').setValue('自行到场');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    const error = fail('validation', '合成服务端字段错误');
    error.fieldErrors = { contact: '称呼仍需人工核对', travel: '请重新核对到场方式' };
    registration.submit.mockRejectedValueOnce(error);
    await submit();
    expect(wrapper.get('#err-travel').text()).toBe('请重新核对到场方式');
    await wrapper.get('#q-travel').setValue('统一集合');
    expect(wrapper.find('#err-travel').exists()).toBe(false);
    expect(wrapper.get('#err-contact').text()).toBe('称呼仍需人工核对');
    await wrapper.get('#q-travel').trigger('blur');
    expect(wrapper.get('#err-contact').text()).toBe('称呼仍需人工核对');
  });

  it('确认等待期间离开报名页，晚到确认不能再发送报名写入', async () => {
    let confirm!: (value: 'confirm') => void;
    vi.mocked(showConfirmDialog).mockImplementationOnce(
      () => new Promise<'confirm'>((resolve) => (confirm = resolve)),
    );
    wrapper = mount(RegisterPage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    await wrapper.get('#q-contact').setValue('确认等待期间的合成输入');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await submit();
    expect(showConfirmDialog).toHaveBeenCalled();
    wrapper.unmount();
    wrapper = undefined;
    confirm('confirm');
    await flushPromises();
    expect(registration.submit).not.toHaveBeenCalled();
  });

  it('恢复页面时后发读取优先，旧表单晚到不能清空新输入', async () => {
    const current = await registration.getForm();
    let finish!: (value: unknown) => void;
    registration.getForm.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    wrapper = mount(RegisterPage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    await wrapper.get('#q-contact').setValue('只属于当前读取的合成输入');
    finish({ ...current, version: 2 });
    await flushPromises();
    expect((wrapper.get('#q-contact').element as HTMLInputElement).value).toBe(
      '只属于当前读取的合成输入',
    );
  });

  it('关联已知动态题并定位输入，不把未知字段注入表单', async () => {
    wrapper = mount(RegisterPage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    await wrapper.get('#q-contact').setValue('合成称呼');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    const error = fail('validation', '请核对报名资料');
    error.fieldErrors = { contact: '合成称呼需要修正', unknown: '不能注入未知字段' };
    registration.submit.mockRejectedValueOnce(error);
    await submit();
    expect(document.activeElement?.id).toBe('q-contact');
    expect(wrapper.get('#err-contact').text()).toBe('合成称呼需要修正');
    expect(wrapper.text()).not.toContain('不能注入未知字段');
    expect((wrapper.get('#q-contact').element as HTMLInputElement).value).toBe('合成称呼');
  });
});
