import type { Ports } from '../ports';
import type { ActivityListItem, RegistrationResult } from '../models';
import { createWire } from '../wire/operations';
import { activityRegistrationForm } from '../wire/activity';
import { fail } from '../../shared/errors';

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
    if (available) throw fail('not-configured', '目录未提供可报名筛选');
    const r = await wire.listActivities({
      q: keyword || undefined,
      type: type || undefined,
      page,
      pageSize: 20,
    });
    return { ...r, items: r.items.map(item), hasMore: r.page * r.pageSize < r.total };
  };
  ports.activities.getDetail = async (id) => {
    const d = await wire.getActivity(id);
    const open =
      d.registrationMode === 'open_apply' &&
      d.phase !== 'ended' &&
      (d.registrationDeadline === null || Date.parse(d.registrationDeadline ?? '') > Date.now());
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
      canCancel: false,
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
  ports.registrations.getMyActivities = () => own();
  ports.registrations.getResult = async (id) => {
    const rows = await own(id);
    return rows.find((x) => x.status !== 'cancelled') ?? rows[0] ?? null;
  };
  ports.activities.getMyParticipationContext = ports.registrations.getResult;
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
