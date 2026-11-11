import { describe, it, expect } from 'vitest';
import { FakeTransport } from '../../src/data/wire/core';
import { createWire } from '../../src/data/wire/operations';
import { readForm } from '../../src/data/wire/reads';
const at = '2026-11-15T00:00:00Z';
const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: { code: 0, message: 'ok', data },
});
const row = {
  id: 'registration-test',
  activityId: 'activity-test',
  statusCode: 'pending',
  waitlistPosition: null,
  registeredAt: at,
  cancelledAt: null,
};
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 20 });
describe('固定读取与命令补充切片', () => {
  it('时长证明按北京业务日查询，秒与分类口径不在页面重算', async () => {
    const proof = {
      proofVersion: 1,
      asOf: at,
      eligibleServiceSeconds: 0,
      legacyRecognizedSeconds: 0,
      volunteerServiceSeconds: 0,
      trainingSeconds: 0,
      organizationSeconds: 0,
      nonCreditableSeconds: 0,
      total: 1,
      page: 1,
      pageSize: 20,
      items: [
        {
          activityId: 'activity-test',
          ledgerDate: '2026-11-15',
          sourceCategoryCode: 'non_creditable',
          sourceMode: 'classified_time_ledger',
          recognizedSeconds: 0,
        },
      ],
    };
    const t = new FakeTransport([ok(proof), ok({ ...proof, proofVersion: 2 })]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.timeProof('2026-11-01', '2026-11-30')).items[0]!.recognizedSeconds).toBe(0);
    expect(t.requests[0]!.path).toBe(
      '/api/app/v1/my/participation-time-proof?dateFrom=2026-11-01&dateTo=2026-11-30&page=1&pageSize=20',
    );
    await expect(w.timeProof('2026-11-01', '2026-11-30')).rejects.toHaveProperty(
      'kind',
      'contract-mismatch',
    );
  });
  it('修改密码只序列化固定字段，使用独立新密码规则且不自动重试', async () => {
    const t = new FakeTransport([ok({ id: 'synthetic-user' })]);
    const w = createWire(t, () => 'SYNTHETIC');
    await expect(w.changePassword('old', 'short')).rejects.toHaveProperty('kind', 'validation');
    await w.changePassword(' old ', 'newpass123');
    expect(t.requests[0]!.body).toEqual({ oldPassword: ' old ', newPassword: 'newpass123' });
    expect(t.requests[0]!.retry).toBe('none');
  });
  it('本人列表、详情与无键取消不伪造逐场结果', async () => {
    const t = new FakeTransport([
      ok(page([{ ...row, activityTitle: '合成活动', activityStartAt: at, activityEndAt: at }])),
      ok(row),
      ok({ ...row, statusCode: 'cancelled', cancelledAt: at }),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.listOwnRegistrations()).items[0]).not.toHaveProperty('sessions');
    await w.getOwnRegistration('registration-test');
    await w.cancelOwnRegistration('registration-test', '合成取消');
    expect(t.requests[2]!.body).toEqual({ cancelReason: '合成取消' });
    expect(t.requests[2]!.retry).toBe('none');
  });
  it('活动详情的表单八类型安全解析，未知题不默默丢弃', () => {
    const field = {
      fieldCode: 'answer',
      typeCode: 'number',
      label: '合成问题',
      required: true,
      minValue: '0',
      maxValue: '10',
      minLength: null,
      maxLength: null,
      maxSelections: null,
      options: null,
    };
    expect(readForm({ version: 1, fields: [field] })!.fields[0]).toHaveProperty('minValue', '0');
    expect(() =>
      readForm({ version: 1, fields: [{ ...field, typeCode: 'new_question' }] }),
    ).toThrow();
    expect(readForm(null)).toBeNull();
  });
  it('活动目录/详情/报名回执只映射已有字段', async () => {
    const base = {
      id: 'activity-test',
      title: '合成',
      activityTypeCode: 'training',
      statusCode: 'published',
      startAt: at,
      endAt: at,
      location: '演示',
      registrationMode: null,
    };
    const t = new FakeTransport([
      ok(page([base])),
      ok({
        ...base,
        description: null,
        requiresInsurance: true,
        phase: 'upcoming',
        formVersion: null,
        registrationForm: null,
        sessions: [],
      }),
      ok({
        registrationId: 'registration-test',
        registrationRevisionId: 'revision-test',
        revision: 1,
        submittedAt: at,
      }),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.listActivities({ page: 1, pageSize: 20 })).total).toBe(1);
    expect((await w.getActivity('activity-test')).registrationForm).toBeNull();
    expect(
      await w.register('activity-test', {
        operationKey: 'op-test',
        formVersion: null,
        answers: [],
        preferences: [],
      }),
    ).not.toHaveProperty('approved');
  });
  it('负责人目录与活动职责分开，空职责为unknown', async () => {
    const t = new FakeTransport([
      ok(
        page([
          {
            activityId: 'activity-test',
            title: '合成',
            statusCode: 'published',
            startAt: at,
            endAt: at,
            relationship: 'collaborator',
            pendingRegistrations: 0,
          },
        ]),
      ),
      ok({ myResponsibility: null }),
      ok({
        myResponsibility: {
          responsibilityType: 'collaborator',
          canManageRegistrations: true,
          canManageAttendance: false,
        },
      }),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.listManagedActivities()).items[0]!.relationship).toBe('collaborator');
    expect((await w.getManagedResponsibility('activity-test')).attendance.state).toBe('unknown');
    expect(await w.getManagedResponsibility('activity-test')).toEqual({
      registration: { state: 'allowed' },
      attendance: { state: 'denied' },
    });
  });
  it('报名管理只读安全标签，部分失败按原对象校验', async () => {
    const t = new FakeTransport([
      ok(
        page([
          {
            registrationId: 'registration-a',
            activityId: 'activity-test',
            member: { label: 'SYNTHETIC 演示人员' },
            statusCode: 'pending',
            waitlistPosition: null,
          },
        ]),
      ),
      ok({
        succeeded: ['registration-a'],
        failed: [{ id: 'registration-b', code: 40300, message: '职责已撤销' }],
      }),
      ok({ succeeded: ['not-requested'], failed: [] }),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.listManagedRegistrations('activity-test')).items[0]).not.toHaveProperty(
      'policyNumber',
    );
    expect(
      (await w.bulkApprove('activity-test', ['registration-a', 'registration-b'])).failed,
    ).toHaveLength(1);
    await expect(w.bulkApprove('activity-test', ['registration-a'])).rejects.toHaveProperty(
      'kind',
      'contract-mismatch',
    );
  });
  it('自购读取保留可空日期，未知审核状态拒绝', async () => {
    const record = {
      id: 'insurance-test',
      insurerName: '合成',
      policyNumber: 'SYNTHETIC',
      coverageStart: null,
      coverageEnd: at,
      reviewStatusCode: 'pending',
      version: 0,
    };
    const t = new FakeTransport([
      ok(page([record])),
      ok(page([{ ...record, reviewStatusCode: 'future' }])),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.listInsurances()).items[0]!.start).toBeNull();
    await expect(w.listInsurances()).rejects.toHaveProperty('kind', 'contract-mismatch');
  });
  it('汇总四轴保留精度，原始账本不执行正向求和', async () => {
    const totals = {
      committedServiceHours: '1.2500',
      committedContributionPoints: '0',
      inFlightServiceHours: '2',
      inFlightContributionPoints: '1',
    };
    const t = new FakeTransport([
      ok({
        totalServiceHours: '1.2500',
        contributionPoints: '0',
        activityCount: 1,
        recordCount: 1,
        ledgerTotals: totals,
      }),
      ok(
        page([
          {
            entryKey: 'entry-test',
            activityId: 'activity-test',
            ledgerDate: '2026-11-15',
            serviceHoursDelta: -1.25,
            recognizedPointsDelta: -1,
            creditedPointsDelta: -1,
            cappedOutPointsDelta: 0,
          },
        ]),
      ),
    ]);
    const w = createWire(t, () => 'SYNTHETIC');
    expect((await w.summary()).ledgerTotals.committedServiceHours).toBe('1.2500');
    expect((await w.ledger()).items[0]!.serviceHoursDelta).toBe(-1.25);
  });
  it('受控代签/工作人员扫码白名单与event-key策略', async () => {
    const response = {
      eventId: 'event-test',
      eventTypeCode: 'check_in',
      occurredAt: at,
      segmentStatusCode: 'open',
      serverTime: at,
      distanceMeters: null,
      geoVerified: false,
      lowAccuracy: true,
      nextAllowedAction: 'check_out',
    };
    const t = new FakeTransport([ok(response), ok(response)]);
    const w = createWire(t, () => 'SYNTHETIC');
    await w.proxy('activity-test', 'session-test', {
      eventKey: 'key-1',
      actionCode: 'check_in',
      participationIdentityId: 'identity-test',
      reason: '合成原因',
    });
    await w.staffScan('activity-test', 'session-test', {
      eventKey: 'key-2',
      actionCode: 'check_in',
      memberCredential: 'SYNTHETIC_MEMBER',
    });
    expect(t.requests.every((r) => r.retry === 'event-key')).toBe(true);
    expect(t.requests[1]!.body).not.toHaveProperty('participationIdentityId');
  });
});
