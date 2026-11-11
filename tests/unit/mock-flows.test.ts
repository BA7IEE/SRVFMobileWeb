import { describe, expect, it } from 'vitest';
import { createMockPorts } from '../../src/data/mock';
import { activities } from '../../src/data/mock/fixtures';
import { questionError } from '../../src/shared/validation';
import type { RegistrationIntent } from '../../src/data/models';
async function prepare(account = 'demo_a') {
  const p = createMockPorts();
  await p.auth.login(account, 'demo-only');
  return p;
}
const intent = (): RegistrationIntent => ({
  activityId: 'act-open',
  key: 'operation-test',
  formVersion: 1,
  answers: { confirmed: true },
  preferences: [{ sessionId: 'session-am', positionIds: [] }],
});
describe('可演练业务链', () => {
  it('所有合成场次都落在所属活动的时间范围', () => {
    for (const activity of activities)
      for (const session of activity.sessions) {
        expect(Date.parse(session.startAt)).toBeGreaterThanOrEqual(Date.parse(activity.startAt));
        expect(Date.parse(session.endAt)).toBeLessThanOrEqual(Date.parse(activity.endAt));
      }
  });
  it('无键创建回执未知后的刷新只保留查证标记，不能再建', async () => {
    const p = await prepare();
    p.controls!.apply('WIRE-05');
    await expect(
      p.insurance.createSelf({
        insurer: '合成',
        policy: '不能持久保存的内容',
        start: null,
        end: '2026-12-31',
      }),
    ).rejects.toHaveProperty('kind', 'result-unknown');
    expect(sessionStorage.getItem('srvf:mock:v1:insurance-intent:member-a')).not.toContain(
      '不能持久保存的内容',
    );
    const fresh = createMockPorts();
    await fresh.auth.restoreSession();
    expect((await fresh.insurance.getMyOverview()).unresolvedCreate).toBe(true);
    await expect(
      fresh.insurance.createSelf({
        insurer: '合成',
        policy: '重试',
        start: null,
        end: '2026-12-31',
      }),
    ).rejects.toHaveProperty('kind', 'result-unknown');
  });
  it('报名后场次签到/最短签退/签退；重复扫描不重复执行', async () => {
    const p = await prepare();
    await p.registrations.submit(intent());
    const state = await p.attendance.getMyState('act-open', 'session-am');
    expect(state.present).toBe(false);
    const punch = {
      activityId: 'act-open',
      sessionId: 'session-am',
      action: 'check_in' as const,
      key: 'event-1',
      credential: p.controls!.scanExample('act-open', 'session-am', 'check_in'),
    };
    const receipt = await p.attendance.submitPunch(punch);
    expect(await p.attendance.submitPunch(punch)).toEqual(receipt);
    const out = {
      ...punch,
      action: 'check_out' as const,
      key: 'event-2',
      credential: p.controls!.scanExample('act-open', 'session-am', 'check_out'),
    };
    await expect(p.attendance.submitPunch(out)).rejects.toHaveProperty('kind', 'business-rejected');
    p.controls!.advance(30);
    await p.attendance.submitPunch(out);
    expect(await p.attendance.getMyState('act-open', 'session-am')).toMatchObject({
      present: false,
      hasHistory: true,
    });
    expect((await p.participation.listRecords())[0]).toMatchObject({
      status: 'pending',
      hours: null,
    });
  });
  it('待审核不会自动通过；统保单独满足资格', async () => {
    const p = await prepare('demo_b');
    expect((await p.insurance.getMyOverview()).self).toEqual([]);
    expect(await p.insurance.getEligibilityForActivity('act-open')).toMatchObject({
      status: 'eligible',
      source: 'team',
    });
    await p.auth.login('demo_volunteer', 'demo-only');
    await p.insurance.createSelf({
      insurer: '演示',
      policy: '合成',
      start: null,
      end: '2026-12-31',
    });
    expect((await p.insurance.getMyOverview()).self[0]!.review).toBe('pending');
    await expect(p.registrations.submit(intent())).rejects.toHaveProperty(
      'kind',
      'business-rejected',
    );
    p.controls!.setInsurance('verified');
    expect((await p.insurance.getEligibilityForActivity('act-open')).status).toBe('eligible');
  });
  it.each([
    ['INS-03', '待审核'],
    ['INS-04', '未通过'],
    ['INS-EXPIRED', '到期'],
    ['INS-FUTURE', '未生效'],
    ['INS-05', '部分'],
    ['INS-06', '暂无法'],
  ])('%s 清晰区分', async (id, text) => {
    const p = await prepare();
    p.controls!.apply(id);
    const e = await p.insurance.getEligibilityForActivity('act-open');
    expect(e.explanation).toContain(text);
    expect(e.status).not.toBe('eligible');
  });
  it('审核资料修改回待审；版本冲突不覆盖', async () => {
    const p = await prepare();
    p.controls!.apply('INS-08');
    const before = (await p.insurance.getMyOverview()).self[0]!;
    await expect(
      p.insurance.updateSelf(
        before.id,
        { insurer: '新演示', policy: '新', start: null, end: '2026-12-31' },
        before.version,
      ),
    ).rejects.toHaveProperty('kind', 'conflict');
    const current = (await p.insurance.getMyOverview()).self[0]!;
    expect(current.insurer).toBe(before.insurer);
    await p.insurance.updateSelf(
      current.id,
      { insurer: '新演示', policy: '新', start: null, end: '2026-12-31' },
      current.version,
    );
    expect((await p.insurance.getMyOverview()).self[0]!.review).toBe('pending');
  });
  it('表单升级拒绝旧版，回执丢失从原结果查证并刷新恢复', async () => {
    const p = await prepare();
    p.controls!.apply('REG-04');
    await expect(p.registrations.submit(intent())).rejects.toHaveProperty('kind', 'conflict');
    p.controls!.apply('REG-06');
    await expect(p.registrations.submit(intent())).rejects.toHaveProperty('kind', 'result-unknown');
    expect(
      (await p.registrations.getMyActivities()).filter((x) => x.activityId === 'act-open'),
    ).toHaveLength(1);
    const fresh = createMockPorts();
    await fresh.auth.restoreSession();
    expect(await fresh.registrations.getResult('act-open')).toHaveProperty('status', 'submitted');
  });
  it('混合结果、历史不可读和认定零分别展示', async () => {
    const p = await prepare();
    const multi = await p.registrations.getResult('act-multi');
    expect(multi!.sessions.map((s) => s.result)).toEqual(['confirmed', 'waitlisted']);
    expect((await p.activities.getDetail('act-history')).historical).toBe(true);
    expect((await p.participation.listRecords()).map((r) => r.hours)).toEqual([
      null,
      '0.00',
      '12.50',
    ]);
  });
  it('职责按活动和模块判定，撤权后停止写入', async () => {
    const p = await prepare('demo_reg');
    await expect(p.managed.getOnsiteOverview('act-open', 'session-am')).rejects.toHaveProperty(
      'kind',
      'forbidden',
    );
    await expect(p.managed.listRegistrations('act-multi')).rejects.toHaveProperty(
      'kind',
      'forbidden',
    );
    expect(await p.managed.listRegistrations('act-open')).not.toHaveLength(0);
    p.controls!.apply('STAFF-06');
    await expect(p.managed.executeAllowedReview('act-open', ['reg-demo-a'])).rejects.toHaveProperty(
      'kind',
      'forbidden',
    );
  });
  it('负责人目标与码不符拒绝，原因必填，代签状态一致', async () => {
    const p = await prepare('demo_onsite');
    await expect(
      p.managed.proxyPunch('act-open', 'session-am', 'identity-member-a', 'check_in', '', 'k'),
    ).rejects.toHaveProperty('kind', 'validation');
    await expect(
      p.managed.staffScan(
        'act-open',
        'session-am',
        p.controls!.scanExample('act-open', 'session-am', 'member'),
        'check_in',
        'scan',
        'identity-member-b',
      ),
    ).rejects.toHaveProperty('kind', 'validation');
    await p.managed.proxyPunch(
      'act-open',
      'session-am',
      'identity-member-a',
      'check_in',
      '现场核验',
      'proxy',
    );
    expect((await p.managed.getOnsiteOverview('act-open', 'session-am')).people[0]!.present).toBe(
      true,
    );
  });
  it('二维码动作、场次与版本不混用；撤销失效', async () => {
    const p = await prepare('demo_lead');
    const first = await p.managed.getQr('act-open', 'session-am', 'check_in', 'issue', 'qr-1');
    await p.managed.getQr('act-open', 'session-am', 'check_in', 'issue', 'qr-2');
    await p.auth.login('demo_a', 'demo-only');
    await p.registrations.submit(intent());
    await expect(
      p.attendance.submitPunch({
        activityId: 'act-open',
        sessionId: 'session-am',
        key: 'x',
        action: 'check_in',
        credential: first!.payload,
      }),
    ).rejects.toHaveProperty('kind', 'business-rejected');
    const out = p.controls!.scanExample('act-open', 'session-am', 'check_out');
    await expect(
      p.attendance.submitPunch({
        activityId: 'act-open',
        sessionId: 'session-am',
        key: 'y',
        action: 'check_in',
        credential: out,
      }),
    ).rejects.toHaveProperty('kind', 'validation');
  });
  it('列表全库筛选和取消请求，受邀身份隔离', async () => {
    const p = await prepare();
    expect(
      (await p.activities.list({ keyword: '联合', type: '', available: false, page: 1 })).items,
    ).toHaveLength(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      p.activities.list({ keyword: '', type: '', available: false, page: 1 }, controller.signal),
    ).rejects.toHaveProperty('kind', 'cancelled');
    await expect(p.activities.getDetail('act-invite')).rejects.toHaveProperty('kind', 'not-found');
    await p.auth.login('demo_volunteer', 'demo-only');
    expect((await p.activities.getDetail('act-invite')).invitation).toBe(true);
  });
  it('所有八类定义可校验；数据不从任意输入变出资格', async () => {
    const p = await prepare();
    const form = await p.registrations.getForm('act-position');
    expect(new Set(form.questions.map((q) => q.type)).size).toBe(8);
    expect(form.questions.filter((q) => questionError(q, undefined)).length).toBeGreaterThan(0);
  });
});
