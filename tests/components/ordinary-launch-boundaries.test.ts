import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { showConfirmDialog } from 'vant';
import RegisterPage from '../../src/features/registrations/pages/RegisterPage.vue';
import OrdinaryActivityPage from '../../src/features/managed/pages/OrdinaryActivityPage.vue';
import { connectMember } from '../../src/data/h5/member';
import { createUnconfiguredPorts } from '../../src/data/unconfigured';
import { FakeTransport, type WireResponse } from '../../src/data/wire/core';
import { ordinaryActivities } from '../../src/data/wire/ordinary-activity';
import { createWire } from '../../src/data/wire/operations';
import { cleanupSession } from '../../src/shared/storage';
import fixture from '../fixtures/activity-detail.v1.json';

const activity = fixture.data.id;
const registration = 'synthetic-registration';
const title = '合成普通活动';
const startAt = '2099-05-01T01:00:00Z';
const endAt = '2099-05-01T04:00:00Z';
let ports: ReturnType<typeof createUnconfiguredPorts>;
let wrapper: VueWrapper;
type Reply = ConstructorParameters<typeof FakeTransport>[0][number];

vi.mock('../../src/data', () => ({ getData: () => ports }));
vi.mock('../../src/features/auth/store', () => ({
  useAuth: () => ({ ready: true, member: { id: 'synthetic-member' } }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { activityId: activity } }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock('vant', async (original) => ({
  ...(await original<typeof import('vant')>()),
  showConfirmDialog: vi.fn(),
}));

beforeEach(() => {
  ports = createUnconfiguredPorts();
  vi.mocked(showConfirmDialog).mockReset().mockResolvedValue('confirm');
});
afterEach(() => {
  wrapper?.unmount();
  cleanupSession();
});
const ok = (data: unknown): WireResponse => ({
  status: 200,
  contentType: 'application/json',
  body: { code: 0, message: 'ok', data },
});
const rejection = (code: number, message: string): WireResponse => ({
  status: 409,
  contentType: 'application/json',
  body: { code, message, data: null },
});
const page = (items: unknown[]) => ok({ items, page: 1, pageSize: 20, total: items.length });
const ownRow = {
  id: registration,
  activityId: activity,
  activityTitle: title,
  statusCode: 'pending',
  waitlistPosition: null,
  registeredAt: startAt,
  cancelledAt: null,
  activityStartAt: startAt,
  activityEndAt: endAt,
};
const submitted = ok({
  registrationId: registration,
  registrationRevisionId: 'synthetic-revision',
  revision: 1,
  submittedAt: startAt,
});
const noteField = {
  fieldCode: 'note',
  typeCode: 'short_text',
  label: '合成备注',
  required: true,
  minValue: null,
  maxValue: null,
  minLength: null,
  maxLength: null,
  maxSelections: null,
  options: null,
};
function memberReads(
  open = true,
  rows: unknown[] = [],
  version: number | null = null,
  definition?: { fieldCode: string; sessionId: string },
) {
  const session = fixture.data.sessions.find((s) => s.code === 'none')!;
  const detail = ok({
    ...fixture.data,
    title,
    startAt,
    endAt,
    publicRegistrationOpen: open,
    registrationMode: 'open_apply',
    formVersion: version,
    registrationForm:
      version === null
        ? null
        : {
            version,
            fields: [{ ...noteField, fieldCode: definition?.fieldCode ?? noteField.fieldCode }],
          },
    sessions: [{ ...session, id: definition?.sessionId ?? session.id, startAt, endAt }],
  });
  return [detail, detail, ok({ required: true, eligible: true }), page(rows)];
}
async function openRegistration(replies: Reply[]) {
  const transport = new FakeTransport(replies);
  connectMember(
    ports,
    createWire(transport, () => 'synthetic'),
  );
  await mountRegistration();
  return transport;
}
async function mountRegistration() {
  wrapper = mount(RegisterPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  });
  await flushPromises();
  await wrapper.get('fieldset input[type=checkbox]').setValue(true);
}
function findButton(label: string) {
  return wrapper.findAll('button').find((b) => b.text() === label);
}
async function submit() {
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}
function writes(t: FakeTransport) {
  return t.requests.filter((r) => r.method !== 'GET');
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('普通活动报名页', () => {
  it('公开报名关闭时，提交事件也不能触发确认或写入', async () => {
    const t = await openRegistration(memberReads(false));
    await submit();
    expect({
      disabled: wrapper.get('button[type=submit]').element.hasAttribute('disabled'),
      confirmations: vi.mocked(showConfirmDialog).mock.calls.length,
      writes: writes(t).length,
    }).toEqual({ disabled: true, confirmations: 0, writes: 0 });
  });

  it('确认等待和写入等待期间再次提交，总共只有一次确认和一次报名', async () => {
    const confirm = pending<'confirm'>();
    const receipt = pending<WireResponse>();
    vi.mocked(showConfirmDialog).mockReturnValueOnce(confirm.promise);
    const t = await openRegistration([...memberReads(), () => receipt.promise, page([ownRow])]);
    await submit();
    await submit();
    const beforeConfirm = writes(t).length;
    confirm.resolve('confirm');
    await flushPromises();
    await submit();
    const whileWriting = writes(t).length;
    receipt.resolve(submitted);
    await flushPromises();
    expect({
      beforeConfirm,
      whileWriting,
      total: writes(t).length,
      confirmations: vi.mocked(showConfirmDialog).mock.calls.length,
      result: wrapper.text().includes('待审核'),
      form: wrapper.find('form').exists(),
    }).toEqual({
      beforeConfirm: 0,
      whileWriting: 1,
      total: 1,
      confirmations: 1,
      result: true,
      form: false,
    });
  });

  it('已有有效报名被拒后，恢复页面读回原报名并收起表单', async () => {
    const t = await openRegistration([
      ...memberReads(),
      rejection(21002, '同一活动同一队员已有有效报名'),
      ...memberReads(true, [ownRow]),
    ]);
    await submit();
    const shownError = wrapper.get('[role=alert]').text();
    const afterRejection = t.requests.length;
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    expect({
      hasError: Boolean(shownError),
      readOnly: t.requests.slice(afterRejection).map((r) => r.method),
      writes: writes(t).length,
      oldResult: wrapper.text().includes('待审核'),
      form: wrapper.find('form').exists(),
    }).toEqual({
      hasError: true,
      readOnly: ['GET', 'GET', 'GET', 'GET'],
      writes: 1,
      oldResult: true,
      form: false,
    });
  });

  it('名额已满时保留场次，无自动重发，手动重试沿用原报名意图', async () => {
    const t = await openRegistration([
      ...memberReads(),
      rejection(21032, '活动名额已满'),
      submitted,
      page([ownRow]),
    ]);
    await submit();
    const afterRejection = {
      error: Boolean(wrapper.get('[role=alert]').text()),
      selected: wrapper.get<HTMLInputElement>('fieldset input').element.checked,
      writes: writes(t).length,
      falseSuccess: wrapper.text().includes('报名与场次结果'),
    };
    await submit();
    const commands = writes(t);
    expect({
      afterRejection,
      methods: commands.map((r) => r.method),
      sameBody:
        commands.length === 2 &&
        JSON.stringify(commands[0]!.body) === JSON.stringify(commands[1]!.body),
      result: wrapper.text().includes('待审核'),
    }).toEqual({
      afterRejection: { error: true, selected: true, writes: 1, falseSuccess: false },
      methods: ['POST', 'POST'],
      sameBody: true,
      result: true,
    });
  });

  it('报名表版本失效后，可从当前表单刷新定义并以新版本提交', async () => {
    const outdated = rejection(21036, '报名表版本不匹配或已失效');
    const replies: Reply[] = [...memberReads(true, [], 1), outdated];
    const t = await openRegistration(replies);
    await wrapper.get('#q-note').setValue('合成输入');
    await submit();
    const refresh = findButton('刷新定义并核对');
    const alert = wrapper.get('[role=alert]').text();
    if (refresh) {
      replies.push(...memberReads(true, [], 2), submitted, page([ownRow]));
      await click('刷新定义并核对');
    } else {
      replies.push(outdated);
    }
    await submit();
    const versions = writes(t).map((r) => (r.body as { formVersion: number }).formVersion);
    expect({ refresh: Boolean(refresh), versions }, '首次拒绝后显示「' + alert + '」').toEqual({
      refresh: true,
      versions: [1, 2],
    });
  });

  it('版本失效后重新打开报名页，重选重填可按新版本提交', async () => {
    const t = await openRegistration([
      ...memberReads(true, [], 1),
      rejection(21036, '报名表版本不匹配或已失效'),
      ...memberReads(true, [], 2),
      submitted,
      page([ownRow]),
    ]);
    await wrapper.get('#q-note').setValue('合成输入');
    await submit();
    const rejected = Boolean(wrapper.get('[role=alert]').text());
    wrapper.unmount();
    await mountRegistration();
    await wrapper.get('#q-note').setValue('重新填写的合成输入');
    await submit();
    expect({
      rejected,
      versions: writes(t).map((r) => (r.body as { formVersion: number }).formVersion),
      pending: wrapper.text().includes('待审核'),
      form: wrapper.find('form').exists(),
    }).toEqual({ rejected: true, versions: [1, 2], pending: true, form: false });
  });

  it('旧版继续锁住，换题换场次后须重选、重填并再次确认', async () => {
    const next = { fieldCode: 'newNote', sessionId: 'synthetic-new-session' };
    const t = await openRegistration([
      ...memberReads(true, [], 1),
      rejection(21036, '报名表版本不匹配或已失效'),
      ...memberReads(true, [], 1),
      ...memberReads(true, [], 2, next),
      submitted,
      page([ownRow]),
    ]);
    await wrapper.get('#q-note').setValue('旧题合成输入');
    await submit();
    const beforeRefresh = t.requests.length;
    await submit();
    expect(t.requests).toHaveLength(beforeRefresh);
    await click('刷新定义并核对');
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined();
    await submit();
    expect(findButton('刷新定义并核对')).toBeDefined();
    await click('刷新定义并核对');
    expect(t.requests.slice(beforeRefresh).map((r) => r.method)).toEqual(Array(8).fill('GET'));
    expect(wrapper.find('#q-note').exists()).toBe(false);
    expect(wrapper.get<HTMLInputElement>('fieldset input').element.checked).toBe(false);
    await submit();
    expect(showConfirmDialog).toHaveBeenCalledTimes(1);
    await wrapper.get('fieldset input').setValue(true);
    await wrapper.get('#q-newNote').setValue('新题合成输入');
    vi.mocked(showConfirmDialog).mockRejectedValueOnce('cancel');
    await submit();
    expect(writes(t)).toHaveLength(1);
    await submit();
    expect(showConfirmDialog).toHaveBeenCalledTimes(3);
    const commands = writes(t);
    expect(commands.map((r) => r.method)).toEqual(['POST', 'POST']);
    const oldBody = commands[0]!.body as { operationKey: string; formVersion: number };
    expect(oldBody.formVersion).toBe(1);
    expect(commands[1]!.body).toEqual({
      operationKey: expect.any(String),
      formVersion: 2,
      answers: [{ fieldCode: next.fieldCode, value: '新题合成输入' }],
      preferences: [{ sessionId: next.sessionId, positionIds: [] }],
    });
    expect(commands[1]!.body).not.toMatchObject({ operationKey: oldBody.operationKey });
    expect(wrapper.text()).toContain('待审核');
  });

  it('刷新定义读取失败后可在当前页重读，全程不会自动补发报名', async () => {
    const failedReads = memberReads(true, [], 2);
    failedReads[1] = rejection(50300, '服务暂不可用');
    const t = await openRegistration([
      ...memberReads(true, [], 1),
      rejection(21036, '报名表已失效'),
      ...failedReads,
      ...memberReads(true, [], 2),
      submitted,
      page([ownRow]),
    ]);
    await wrapper.get('#q-note').setValue('合成输入');
    await submit();
    const beforeRefresh = t.requests.length;
    await click('刷新定义并核对');
    expect(wrapper.get('[role=alert]').text()).toContain('服务暂不可用');
    expect(wrapper.find('form').exists()).toBe(false);
    await click('重新读取');
    expect(t.requests.slice(beforeRefresh).map((r) => r.method)).toEqual(Array(8).fill('GET'));
    await wrapper.get('fieldset input').setValue(true);
    await wrapper.get('#q-note').setValue('重新核对的输入');
    await submit();
    expect(writes(t).map((r) => (r.body as { formVersion: number }).formVersion)).toEqual([1, 2]);
    expect(wrapper.text()).toContain('待审核');
  });

  it.each([1, null])('失效后按当前有效定义 %s 提交，兼容无自定义表单', async (version) => {
    const t = await openRegistration([
      ...memberReads(true, [], 2),
      rejection(21036, '报名表已失效'),
      ...memberReads(true, [], version),
      submitted,
      page([ownRow]),
    ]);
    await wrapper.get('#q-note').setValue('已核对的合成输入');
    await submit();
    await click('刷新定义并核对');
    expect(writes(t)).toHaveLength(1);
    expect(wrapper.find('#q-note').exists()).toBe(version !== null);
    await submit();
    expect(showConfirmDialog).toHaveBeenCalledTimes(2);
    expect(writes(t)[1]?.body).toMatchObject({
      formVersion: version,
      answers: version === null ? [] : [{ fieldCode: 'note', value: '已核对的合成输入' }],
    });
    expect(wrapper.text()).toContain('待审核');
  });

  it('确认弹窗等待期间重读了定义，旧确认不能提交新版本', async () => {
    const confirm = pending<'confirm'>();
    vi.mocked(showConfirmDialog).mockReturnValueOnce(confirm.promise);
    const t = await openRegistration([
      ...memberReads(true, [], 1),
      ...memberReads(true, [], 2),
      submitted,
      page([ownRow]),
    ]);
    await wrapper.get('#q-note').setValue('旧版合成输入');
    await submit();
    expect(showConfirmDialog).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('srvf:resume'));
    await flushPromises();
    confirm.resolve('confirm');
    await flushPromises();
    expect(writes(t)).toHaveLength(0);
    await wrapper.get('fieldset input').setValue(true);
    await wrapper.get('#q-note').setValue('新版合成输入');
    await submit();
    expect(showConfirmDialog).toHaveBeenCalledTimes(2);
    expect(writes(t).map((r) => (r.body as { formVersion: number }).formVersion)).toEqual([2]);
    expect(wrapper.text()).toContain('待审核');
  });
});

const directory = page([
  { activityId: activity, title, relationship: 'initiator', statusCode: 'published' },
]);
const options = ok([]);
const detail = ok({
  activity: {
    id: activity,
    title,
    statusCode: 'published',
    allocationModeCode: 'qualification_rank',
    location: '合成场地',
    startAt,
    endAt,
  },
  publishReview: { status: null },
  myResponsibility: { canManageRegistrations: true },
});
function roster(statusCode: string) {
  return page([
    {
      activityId: activity,
      registrationId: registration,
      statusCode,
      member: { label: '合成队员' },
    },
  ]);
}
const admitted = ok({ activityId: activity, registrationId: registration, statusCode: 'pass' });
function activityReads(last: Reply) {
  return [directory, options, detail, last];
}
async function click(label: string) {
  const button = findButton(label);
  if (!button) throw new Error('缺少按钮 ' + label);
  await button.trigger('click');
  await flushPromises();
}
async function openManager(afterOpen: Reply[]) {
  const t = new FakeTransport([
    directory,
    options,
    ...activityReads(roster('pending')),
    ...afterOpen,
  ]);
  ports.ordinaryActivities = ordinaryActivities(t);
  wrapper = mount(OrdinaryActivityPage);
  await flushPromises();
  await click(title);
  return t;
}
describe('普通活动手工录取页', () => {
  it('同活动错报名回执锁住录取，重读仍待录取后才可手动再办', async () => {
    const wrong = ok({
      activityId: activity,
      registrationId: 'synthetic-other-row',
      statusCode: 'pass',
    });
    const t = await openManager([
      wrong,
      ...activityReads(roster('pending')),
      admitted,
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    const locked = findButton('录取')!.element.disabled;
    const notice = wrapper.get('[role=status]').text();
    const afterError = t.requests.length;
    await click('刷新记录');
    const recovery = t.requests.slice(afterError).map((r) => r.method);
    const unlocked = !findButton('录取')!.element.disabled;
    await click('录取');
    expect({
      locked,
      warns: notice.includes('录取回执') && notice.includes('请刷新核对'),
      recovery,
      unlocked,
      writes: writes(t).map((r) => r.method),
      final: wrapper.get('[role=status]').text(),
      passed: wrapper.text().includes('已通过'),
      canAdmitAgain: Boolean(findButton('录取')),
    }).toEqual({
      locked: true,
      warns: true,
      recovery: ['GET', 'GET', 'GET', 'GET'],
      unlocked: true,
      writes: ['PATCH', 'PATCH'],
      final: '已录取',
      passed: true,
      canAdmitAgain: false,
    });
  });

  it('录取回执有效但名单读取失败时不报成功，重新打开活动只读恢复', async () => {
    const unavailable = {
      status: 503,
      contentType: 'application/json',
      body: { code: 50300, message: '服务暂不可用' },
    };
    const t = await openManager([
      admitted,
      ...activityReads(unavailable),
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    const notice = wrapper.get('[role=status]').text();
    const beforeRecovery = t.requests.length;
    await click(title);
    expect({
      notice,
      recovery: t.requests.slice(beforeRecovery).map((r) => r.method),
      writes: writes(t).length,
      passed: wrapper.text().includes('已通过'),
      canAdmitAgain: Boolean(findButton('录取')),
    }).toEqual({
      notice: '服务暂不可用。请刷新核对当前记录后再办理。',
      recovery: ['GET', 'GET', 'GET', 'GET'],
      writes: 1,
      passed: true,
      canAdmitAgain: false,
    });
  });

  it('录取回执通过但同一行读回待录取时，不同时报成功并允许再次写入', async () => {
    const t = await openManager([
      admitted,
      ...activityReads(roster('pending')),
      rejection(21030, '报名记录当前状态不允许此操作'),
    ]);
    await click('录取');
    const success =
      wrapper.find('[role=status]').exists() && wrapper.get('[role=status]').text() === '已录取';
    const pendingRow = wrapper.text().includes('合成队员 · 待录取');
    const retry = findButton('录取');
    const canRepeat = Boolean(retry && !retry.element.disabled);
    if (success && pendingRow && canRepeat) await click('录取');
    expect({
      conflictingActions: success && pendingRow && canRepeat,
      writes: writes(t).length,
    }).toEqual({ conflictingActions: false, writes: 1 });
  });

  it('回执与同一行矛盾时锁住写入，显式刷新失败后仍能重读原活动并人工再办', async () => {
    const t = await openManager([
      admitted,
      ...activityReads(roster('pending')),
      ...activityReads(rejection(50300, '服务暂不可用')),
      ...activityReads(roster('pending')),
      admitted,
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    expect(wrapper.get('[role=status]').text()).toContain('请刷新核对');
    expect(wrapper.text()).toContain('合成队员 · 待录取');
    expect(findButton('录取')!.element.disabled).toBe(true);
    const beforeRecovery = t.requests.length;
    await click('录取');
    expect(t.requests).toHaveLength(beforeRecovery);
    expect(showConfirmDialog).toHaveBeenCalledTimes(1);
    await click('刷新记录');
    expect(wrapper.get('[role=status]').text()).toContain('服务暂不可用');
    expect(findButton('录取')).toBeUndefined();
    await click('刷新记录');
    const reads = t.requests.slice(beforeRecovery);
    expect(reads.map((r) => r.method)).toEqual(Array(8).fill('GET'));
    expect(reads.slice(0, 4).map((r) => r.path)).toEqual(reads.slice(4).map((r) => r.path));
    expect(writes(t)).toHaveLength(1);
    expect(findButton('录取')!.element.disabled).toBe(false);
    await click('录取');
    expect(writes(t).map((r) => r.method)).toEqual(['PATCH', 'PATCH']);
    expect(showConfirmDialog).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role=status]').text()).toBe('已录取');
    expect(wrapper.text()).toContain('合成队员 · 已通过');
    expect(findButton('录取')).toBeUndefined();
  });

  it('目标报名缺行时其他行通过也不能证实录取，重读目标行通过后无需重发', async () => {
    const otherRow = page([
      {
        activityId: activity,
        registrationId: 'synthetic-other-row',
        statusCode: 'pass',
        member: { label: '另一合成队员' },
      },
    ]);
    const t = await openManager([
      admitted,
      ...activityReads(otherRow),
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    expect(wrapper.get('[role=status]').text()).toContain('请刷新核对');
    expect(wrapper.text()).toContain('另一合成队员 · 已通过');
    const beforeRecovery = t.requests.length;
    await click('刷新记录');
    expect(t.requests.slice(beforeRecovery).map((r) => r.method)).toEqual(Array(4).fill('GET'));
    expect(writes(t)).toHaveLength(1);
    expect(wrapper.text()).toContain('合成队员 · 已通过');
    expect(findButton('录取')).toBeUndefined();
  });

  it('显式刷新返回同一报名的两种状态时，须再读到唯一行才能办理', async () => {
    const duplicate = page(
      ['pending', 'pass'].map((statusCode) => ({
        activityId: activity,
        registrationId: registration,
        member: { label: '合成队员' },
        statusCode,
      })),
    );
    const t = await openManager([
      admitted,
      ...activityReads(roster('pending')),
      ...activityReads(duplicate),
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    await click('刷新记录');
    expect(wrapper.get('[role=status]').text()).toContain('请刷新核对');
    expect(findButton('录取')).toBeUndefined();
    await click('刷新记录');
    expect(writes(t)).toHaveLength(1);
    expect(wrapper.text()).toContain('合成队员 · 已通过');
    expect(findButton('录取')).toBeUndefined();
  });
});

describe('手工录取后连续缺少目标报名', () => {
  const other = {
    activityId: activity,
    registrationId: 'synthetic-other-row',
    member: { label: '第二位队员' },
    statusCode: 'pending',
  };
  function notices() {
    return wrapper
      .findAll('[role=status]')
      .map((item) => item.text())
      .join(' ');
  }

  it('刷新仍缺原报名时保留该队员的提示，再读到通过只产生一次 PATCH', async () => {
    const onlyOther = page([other]);
    const t = await openManager([
      admitted,
      ...activityReads(onlyOther),
      ...activityReads(onlyOther),
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    expect(notices()).toContain('请刷新核对');
    const afterAdmission = t.requests.length;
    await click('刷新记录');
    expect(t.requests.slice(afterAdmission).map((r) => r.method)).toEqual(Array(4).fill('GET'));
    expect(notices()).toContain('核对');
    expect(notices()).toContain('合成队员');
    expect(wrapper.text()).toContain('第二位队员 · 待录取');
    expect(findButton('录取')!.element.disabled).toBe(false);
    vi.mocked(showConfirmDialog).mockRejectedValueOnce('cancel');
    await click('录取');
    expect(showConfirmDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: expect.stringContaining('第二位队员') }),
    );
    expect(notices()).toContain('合成队员');
    await click('刷新记录');
    expect(t.requests.slice(afterAdmission).map((r) => r.method)).toEqual(Array(8).fill('GET'));
    expect(writes(t).map((r) => r.method)).toEqual(['PATCH']);
    expect(wrapper.text()).toContain('合成队员 · 已通过');
    expect(notices()).not.toContain('核对');
    expect(findButton('录取')).toBeUndefined();
  });

  it('办理其他报名不会覆盖原报名提示，重读原行为待录取后可重新确认', async () => {
    const onlyOther = page([other]);
    const t = await openManager([
      admitted,
      ...activityReads(onlyOther),
      ...activityReads(onlyOther),
      ok({ activityId: activity, registrationId: other.registrationId, statusCode: 'pass' }),
      ...activityReads(page([{ ...other, statusCode: 'pass' }])),
      ...activityReads(roster('pending')),
      admitted,
      ...activityReads(roster('pass')),
    ]);
    await click('录取');
    await click('刷新记录');
    await click('录取');
    expect(wrapper.text()).toContain('第二位队员 · 已通过');
    expect(notices()).toContain('合成队员');
    expect(notices()).toContain('核对');
    const afterOther = t.requests.length;
    await click('刷新记录');
    expect(t.requests.slice(afterOther).map((r) => r.method)).toEqual(Array(4).fill('GET'));
    expect(notices()).not.toContain('请刷新核对');
    expect(wrapper.text()).toContain('合成队员 · 待录取');
    expect(findButton('录取')!.element.disabled).toBe(false);
    expect(showConfirmDialog).toHaveBeenCalledTimes(2);
    expect(writes(t)).toHaveLength(2);
    await click('录取');
    expect(showConfirmDialog).toHaveBeenCalledTimes(3);
    expect(writes(t).map((r) => [r.method, r.path.split('/').at(-2)])).toEqual([
      ['PATCH', registration],
      ['PATCH', other.registrationId],
      ['PATCH', registration],
    ]);
    expect(wrapper.text()).toContain('合成队员 · 已通过');
  });
});
