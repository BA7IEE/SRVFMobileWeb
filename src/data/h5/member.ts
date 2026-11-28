import type { Ports } from '../ports';
import type { ActivityListItem, RegistrationResult, SelfInsurance } from '../models';
import { createWire } from '../wire/operations';
import { activityRegistrationForm } from '../wire/activity';
import { fail } from '../../shared/errors';

async function readPage<T>(
  page: number | undefined,
  load: (page: number) => Promise<{ items: T[]; total: number; page: number; pageSize: number }>,
) {
  const pageNumber = page ?? 1;
  const result = await load(pageNumber);
  const expected = Math.max(
    0,
    Math.min(result.pageSize, result.total - (pageNumber - 1) * result.pageSize),
  );
  if (result.page !== pageNumber || result.pageSize !== 20 || result.items.length !== expected)
    throw fail('contract-mismatch', '分页回执不一致');
  return {
    items: result.items,
    total: result.total,
    page: result.page,
    hasMore: result.page * result.pageSize < result.total,
  };
}

export function connectMember(ports: Ports, wire: ReturnType<typeof createWire>) {
  type DirectoryRow = Awaited<ReturnType<typeof wire.listActivities>>['items'][number];
  function item(r: DirectoryRow): ActivityListItem {
    return {
      ...r,
      phase: Date.parse(r.endAt) <= Date.now() ? 'ended' : 'published',
      invitation: r.registrationMode === 'invitation_only',
      summary: '',
    };
  }
  ports.activities.list = async ({ keyword, type, page, available }) => {
    const r = available
      ? await wire.listAvailable(page)
      : await wire.listActivities({
          q: keyword || undefined,
          type: type || undefined,
          page,
          pageSize: 20,
        });
    return { ...r, items: r.items.map(item), hasMore: r.page * r.pageSize < r.total };
  };
  ports.activities.getDetail = async (id) => {
    const d = await wire.getActivity(id);
    const open = d.publicRegistrationOpen;
    return {
      ...item(d),
      description: d.description ?? '',
      phase: d.phase === 'ended' ? 'ended' : open ? 'open' : 'closed',
      sessions: activityRegistrationForm(d).sessions,
      qualification: d.qualification,
      registration: open
        ? { state: 'allowed' }
        : { state: 'denied', reason: '当前活动暂不可公开报名' },
      historical: d.phase === 'ended',
      canEdit: false,
      canCancel: false,
    };
  };
  ports.registrations.getForm = async (id) => activityRegistrationForm(await wire.getActivity(id));
  ports.insurance.getMyOverview = async () => {
    const self: SelfInsurance[] = [];
    for (let page = 1; ; page++) {
      const result = await wire.listInsurances(page);
      const expectedCount = Math.max(0, Math.min(20, result.total - (page - 1) * 20));
      if (result.page !== page || result.pageSize !== 20 || result.items.length !== expectedCount)
        throw fail('contract-mismatch', '保险分页回执不一致');
      self.push(...result.items);
      if (page * result.pageSize >= result.total) return { self, team: null };
    }
  };
  ports.insurance.createSelf = async (input) => {
    await wire.createInsurance(input);
  };
  ports.insurance.updateSelf = async (id, input, version) => {
    await wire.updateInsurance(id, input, version);
  };
  ports.insurance.deleteSelf = async (id, version) => {
    await wire.deleteInsurance(id, version);
  };
  ports.insurance.getEligibilityForActivity = async (id) => {
    const { required, eligible } = await wire.registrationInsurance(id);
    return {
      activityId: id,
      required,
      status: eligible ? 'eligible' : 'ineligible',
      explanation: !required
        ? '活动未要求保险'
        : eligible
          ? '本人保险覆盖本次活动'
          : '本人保险未覆盖本次活动',
      checkedAt: new Date().toISOString(),
    };
  };
  type OwnRow = Awaited<ReturnType<typeof wire.listOwnRegistrations>>['items'][number];
  function result(r: OwnRow): RegistrationResult {
    return {
      id: r.id,
      activityId: r.activityId,
      title: r.title,
      status: r.statusCode === 'cancelled' ? 'cancelled' : 'submitted',
      serverStatus: r.statusCode,
      phase: Date.parse(r.endAt) <= Date.now() ? 'ended' : 'published',
      sessions: [],
      canCancel:
        r.statusCode === 'pending' || r.statusCode === 'pass' || r.statusCode === 'waitlisted',
      canEdit: false,
    };
  }
  const own = async (activityId?: string) => {
    const found: RegistrationResult[] = [];
    for (let page = 1; ; page++) {
      const r = await wire.listOwnRegistrations(page);
      if (r.page !== page) throw fail('contract-mismatch', '报名分页回执不一致');
      found.push(...r.items.map(result).filter((x) => !activityId || x.activityId === activityId));
      if (r.page * r.pageSize >= r.total || !r.items.length) return found;
    }
  };
  ports.registrations.getMyActivities = async () => {
    const found: RegistrationResult[] = [];
    for (let page = 1; ; page++) {
      const r = await wire.listMyActivities(page);
      if (r.page !== page || r.pageSize !== 20)
        throw fail('contract-mismatch', '我的活动分页回执不一致');
      found.push(
        ...r.items.map((row) => ({
          id: row.myRegistrationId,
          activityId: row.activityId,
          title: row.title,
          status:
            row.myRegistrationStatusCode === 'cancelled'
              ? ('cancelled' as const)
              : ('submitted' as const),
          serverStatus: row.myRegistrationStatusCode,
          activityStatusCode: row.statusCode,
          phase:
            row.statusCode === 'cancelled'
              ? ('cancelled' as const)
              : row.statusCode === 'completed' || Date.parse(row.endAt) <= Date.now()
                ? ('ended' as const)
                : ('published' as const),
          sessions: [],
          canCancel:
            row.myRegistrationStatusCode === 'pending' ||
            row.myRegistrationStatusCode === 'pass' ||
            row.myRegistrationStatusCode === 'waitlisted',
          canEdit: false,
        })),
      );
      if (r.page * r.pageSize >= r.total || !r.items.length) return found;
    }
  };
  ports.registrations.cancel = async (activityId) => {
    const rows = await own(activityId);
    const target = rows.find(
      (row) =>
        row.serverStatus === 'pending' ||
        row.serverStatus === 'pass' ||
        row.serverStatus === 'waitlisted',
    );
    if (!target) throw fail('business-rejected', '当前不能取消报名');
    const updated = await wire.cancelOwnRegistration(target.id);
    if (updated.statusCode !== 'cancelled' || updated.id !== target.id)
      throw fail('contract-mismatch', '取消回执不是已取消');
  };
  ports.registrations.getResult = async (id) => {
    const rows = await own(id);
    return rows.find((x) => x.status !== 'cancelled') ?? rows[0] ?? null;
  };
  ports.activities.getMyParticipationContext = ports.registrations.getResult;
  ports.attendance.getMyHiddenSession = async (activityId, sessionId) => {
    // A session identity may outlive a registration. Confirm current approval or responsibility.
    const state = await ports.attendance.getMyState(activityId, sessionId);
    const registrations = await own(activityId).catch(() => []);
    const passed = registrations.find((row) => row.serverStatus === 'pass');
    if (passed) return { title: passed.title, state };
    const scope = await wire.getManagedResponsibility(activityId).catch(() => null);
    return scope && scope.attendance.state !== 'unknown' ? { title: scope.title, state } : null;
  };
  ports.registrations.submit = async (intent) => {
    const receipt = await wire.register(intent.activityId, {
      operationKey: intent.key,
      formVersion: intent.formVersion,
      preferences: intent.preferences,
      answers: Object.entries(intent.answers).map(([fieldCode, value]) => ({ fieldCode, value })),
    });
    try {
      const row = (await own(intent.activityId)).find((r) => r.id === receipt.registrationId);
      if (row) return row;
    } catch {
      /* The write already has a receipt. Never retry it on a failed read. */
    }
    throw fail('result-unknown', '报名已收件，暂未取得本人记录，请查看我的活动');
  };
  ports.memberHome = {
    listCertificates: (page) => readPage(page, wire.listCertificates),
    listAttendanceRecords: (page) => readPage(page, wire.listAttendanceRecords),
    listNotices: (page) => readPage(page, wire.listNotices),
    getNotice: wire.getNotice,
    markNoticeRead: wire.markNoticeRead,
    unreadCount: wire.unreadCount,
    listContents: (page) => readPage(page, wire.listContents),
    getContent: wire.getContent,
    getProfile: wire.getProfile,
    updateNickname: wire.updateNickname,
    getAvatar: wire.getAvatar,
    getTeamJoin: wire.getTeamJoinCurrent,
    getFeedback: wire.getFeedback,
    submitFeedback: wire.submitFeedback,
  };
  ports.participation.listRecords = async () => {
    const rows = [];
    for (let page = 1; ; page++) {
      const ledger = await wire.ledger(undefined, page);
      if (ledger.page !== page) throw fail('contract-mismatch', '参与账本分页回执不一致');
      rows.push(
        ...ledger.items.map((r) => ({
          id: r.entryKey,
          title: '参与账本',
          session: r.ledgerDate,
          status: 'recognized' as const,
          hours: String(r.serviceHoursDelta),
          points: String(r.creditedPointsDelta),
          historical: false,
        })),
      );
      if (ledger.page * ledger.pageSize >= ledger.total || !ledger.items.length) return rows;
    }
  };
  ports.participation.getRecordDetail = async (id) => {
    const r = (await ports.participation.listRecords()).find((row) => row.id === id);
    if (!r) throw fail('not-found', '未找到本人账本记录');
    return r;
  };
}
